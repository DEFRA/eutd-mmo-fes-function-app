const axios = require("axios");
const https = require('https');
const appInsights = require('./src/appInsights');
const axiosInterceptors = require('./src/axiosInterceptors');
const { MongoClient } = require("mongodb");

let httpsAgent = new https.Agent({ keepAlive: false });

/**
 * Config of the Azure function.
 * Configured through environment variables.
 */
let config = {
	dbName: process.env.DB_NAME || 'local_mmo_exportcert',
	dbConnectionUri: process.env.DB_CONNECTION_URI || 'mongodb://127.0.0.1:27017',
	batchSize: process.env.BATCH_CERTIFICATES_NUMBER || 1000,
	startDate: process.env.QUERY_START_DATE || '2025-01-09',
	endDate: process.env.QUERY_END_DATE || '2025-02-13',
	businessContinuityUrl: process.env.BUSINESS_CONTINUITY_URL || 'https://eutd-mmo-bc.dev.cdp-int.defra.cloud',
	businessContinuityKey: process.env.BUSINESS_CONTINUITY_KEY || '00000000-0000-1000-A000-000000000000',
	retries: process.env.NUMBER_OF_RETRIES || 4,
	retryDelay: process.env.RETRY_DELAY_IN_MS || 1000,
	instrumentationKey: process.env.APPINSIGHTS_INSTRUMENTATIONKEY || null,
	apiName: process.env.API_NAME || '/api/certificates'
}

/**
 * Get the current time.
 */
const timeNow = () =>
	new Date(Date.now()).toISOString();

/**
 * 
 * @param {*} url 
 * @param {*} maxRetries 
 * @returns 
 */
async function makeApiCallWithRetry(url, apiName, key, data, maxRetries, retryDelay, context) {
	const config = {
		headers: {
			'X-API-KEY': key,
			'accept': 'application/json'
		},
		httpsAgent: httpsAgent
	};

	let retryCount = 0;
	const status200 = 200;
	while (retryCount < maxRetries) {
		try {
			context.log(`[SCHEDULED-JOBS][BC-RECONCILIATION][MAKE-API-CALL][${url}${apiName}][RETRY: ${retryCount}]`);
			const response = await axios.put(`${url}${apiName}`, data, config);
			
			if (response.status !== status200) {
				context.log.error(`[SCHEDULED-JOBS][BC-RECONCILIATION][MAKE-API-CALL][${response}]`);
				throw new Error(response);
			}

			return response;
		} catch (error) {
			retryCount++;
			if (retryCount >= maxRetries) {
				throw new Error('Max retries exceeded' + error);
			}

			await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * retryDelay)); // Exponential backoff
		}
	}
}

const batchArray = (array, batchSize) => {
  return Array.from(
    { length: Math.ceil(array.length / batchSize) },
    (_, index) => array.slice(index * batchSize, (index + 1) * batchSize)   
  );
}

/**
 * The Azure Function which will use a timer in order to trigger the landings and reporting
 * job every X hours (as configured per environment)
 *
 * @param {*} context the context - as per standard pattern for a Timer-based Azure function.
 * @param {*} myTimer the timer - as per standard pattern for a Timer-based Azure function.
 * @param {Object} overrideConfig additional config
 */
const func = async (context, myTimer, overrideConfig) => {
	context.log(`[SCHEDULED-JOBS][BC-RECONCILIATION][STARTED]`, timeNow());
	appInsights.trackEvent('[SCHEDULED-JOBS][BC-RECONCILIATION][STARTED]');

	config = {...config, ...overrideConfig}

	if (myTimer.IsPastDue)
		context.log('[SCHEDULED-JOBS][BC-RECONCILIATION][RUNNING-LATE]', timeNow());

	if (config.instrumentationKey)
		appInsights.init(config.instrumentationKey, context);

	axiosInterceptors.init(axios);

	const uri = config.dbConnectionUri;
	const client = new MongoClient(uri, {
		useNewUrlParser: true,
		useUnifiedTopology: true,
	});

	try {
		context.log(`[SCHEDULED-JOBS][BC-RECONCILIATION][DB_NAME][${config.dbName}]`, timeNow());
		appInsights.trackEvent(`[SCHEDULED-JOBS][BC-RECONCILIATION][DB_NAME][${config.dbName}]`);

		await client.connect();
		const database = client.db(config.dbName);
		const collection = database.collection("exportCertificates");

		const startDate = new Date(config.startDate);
		const endDate = new Date(config.endDate);
		const nextDate = new Date(endDate);
		nextDate.setDate(endDate.getDate() + 1);

		const query = {
			createdAt: {
				$gte: startDate,
				$lte: nextDate
			},
			status: { $in: [ "COMPLETE", "VOID" ] }
		};

		context.log(`[SCHEDULED-JOBS][BC-RECONCILIATION][DOCUMENT-QUERY][${JSON.stringify(query)}]`, timeNow());
		appInsights.trackEvent(`[SCHEDULED-JOBS][BC-RECONCILIATION][DOCUMENT-QUERY][${JSON.stringify(query)}]`);

		const documents = (await collection.find(query).toArray()).map((document) => {
			return {
				certNumber: document.documentNumber,
				status: document.status,
				timestamp: document.status === "COMPLETE" ? document.createdAt : timeNow()
			}
		});

		context.log(`[SCHEDULED-JOBS][BC-RECONCILIATION][DOCUMENT-COUNT][${documents.length}]`, timeNow());
		appInsights.trackEvent(`[SCHEDULED-JOBS][BC-RECONCILIATION][DOCUMENT-COUNT][${documents.length}]`);

		const batchSize = config.batchSize;
		const apiUrl = config.businessContinuityUrl;
		const key = config.businessContinuityKey;
		const retries = config.retries;
		const delay = config.retryDelay;
		const apiName = config.apiName;
		const batches = batchArray(documents, batchSize);

		context.log(`[SCHEDULED-JOBS][BC-RECONCILIATION][BATCH-SIZE][${batchSize}]`, timeNow());
		appInsights.trackEvent(`[SCHEDULED-JOBS][BC-RECONCILIATION][BATCH-SIZE][${batchSize}]`);

		for (const batch of batches) {
			const response = await makeApiCallWithRetry(
				apiUrl,
				apiName,
				key,
				batch,
				retries,
				delay,
				context
			);
			context.log("Batch Data sent to BC", response.data);
			appInsights.trackRequest("PUT " + apiName, apiUrl, response);
		}

		appInsights.trackEvent('[SCHEDULED-JOBS][BC-RECONCILIATION][SUCCEEDED]');

		context.res = {
			status: 200,
			body: 'Success'
		};
	} catch (error) {
		context.log.error("Failed to call API for batch:", error.message);
		appInsights.trackRequest("PUT " + config.apiName, config.businessContinuityUrl, error);

		appInsights.trackEvent('[SCHEDULED-JOBS][BC-RECONCILIATION][FAILED]');

		context.res = {
			status: 500,
			body: `Error: ${error.message}`,
		};

		throw error;
	} finally {
		await client.close();
	}
};

/**
 * Export the Azure Function.
 */
module.exports = func;
