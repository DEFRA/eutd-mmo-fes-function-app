const axios = require("axios");
const https = require('https');
const fs = require('fs');
const appInsights = require('./src/appInsights');
const axiosInterceptors = require('./src/axiosInterceptors');

let httpsAgent = new https.Agent({ keepAlive: false });

/**
 * Config of the Azure function.
 * Configured through environment variables.
 */
let config = {
	url: process.env.DATA_READER_URL || 'http://localhost:9000/v1/jobs/landings',
	timeoutMS: process.env.TIMEOUT_IN_MS || 600000,
	retries: process.env.NUMBER_OF_RETRIES || 4,
	retryDelay: process.env.RETRY_DELAY_IN_MS || 300000,
	instrumentationKey: process.env.APPINSIGHTS_INSTRUMENTATIONKEY || null
}

/**
 * Get the current time.
 */
const timeNow = () =>
	new Date(Date.now()).toISOString();
	
/**
 * Returns a promise which will resolve successfully after a given time.
 * 
 * @param {number} time The number of milliseconds to wait before resolving the promise.
 * 
 * @returns {Promise} a simple promise that will resolve after _time_ milliseconds.
 */
const wait = (time) =>
	new Promise(resolve => setTimeout(resolve, time || 0));

/**
 * Will call a function which returns a promise - and retry on failure.
 * 
 * @param {Function} fn The input function. Takes the number of retries remaining and returns a promise.
 * @param {number} retries The amount of times to retry if the initial call fails.
 * @param {Function} delayFn A function which takes the number of retries remaining and returns how long to 
 * 													 wait before the next retry.
 * 
 * @returns {Promise} the result of calling _fn_ if successful, or a rejected promise if we continue to fail
 * 										and ultimately stop retrying.
 */
const retry = (fn, retries, delayFn) =>
	fn(retries).catch(e =>
		(retries > 0)
			? wait(delayFn(retries)).then(() => retry(fn, retries - 1, delayFn))
			: Promise.reject('failed')
	);

/**
 * Function which returns a function which will calculate the delay to wait between failed attempts,
 * based on how many retries have been used (delay increases after each failed attempt).
 * 
 * @param {number} delay the base delay to use in MS. First retry will have a delay of 0, the delay for every
 * 											 retry after will increase by this much. i.e. if delay is 5 minutes, retry 1 will be
 * 											 immediate, 2 will wait 5 minutes, 3 will wait 10, 4 will wait 15, etc...
 * @param {number} totalRetries the total number of retries before giving up.
 * @returns {Function} a function which will calculate the delay to use for a given retry attempt.
 * 
 * @param {number} retriesRemaining the number of retries remaining before we give up entirely.
 * @returns {number} the delay in milliseconds to wait before retrying.
 */
const calcDelay = (delay, totalRetries) => (retriesRemaining) =>
	(totalRetries - retriesRemaining) * delay;

/**
 * Function which returns a function which will make a HTTP call to the data reader to
 * start the landings & reporting scheduled job.
 * 
 * @param {Function} log function we want to use for logging debug info
 * @param {number} totalRetries the total number of retries that will be used when calling this function
 * @returns {Function} anonymous function as detailed below:
 * 
 * @param {number} retriesRemaining the number of retries remaining from when this function is called
 * @returns {Promise} the result of making a http call to start the landings & reporting job
 */
const httpReq = (log, totalRetries) => (retriesRemaining) => {
	const attempt = (totalRetries - retriesRemaining) + 1;
	const apiName = 'POST /v1/jobs/landings'
	const apiUrl = config.url

	log(`[SCHEDULED-JOBS][LANDING-AND-REPORTING][MAKING-HTTP-CALL][ATTEMPT-${attempt}]`, timeNow());

	return axios.post(config.url, null, {timeout: config.timeoutMS, httpsAgent: httpsAgent})
		.then((res) => appInsights.trackRequest(apiName, apiUrl, res))
		.catch((e) => {
			log(`[SCHEDULED-JOBS][LANDING-AND-REPORTING][ERROR][ATTEMPT-${attempt}]`, timeNow(), e);
			appInsights.trackRequest(apiName, apiUrl, e);
			return Promise.reject(e);
		})
};

/**
 * The Azure Function which will use a timer in order to trigger the landings and reporting
 * job every X hours (as configured per environment)
 * 
 * @param {*} context the context - as per standard pattern for a Timer-based Azure function.
 * @param {*} myTimer the timer - as per standard pattern for a Timer-based Azure function.
 * @param {Object} overrideConfig additional config
 */
const func = async (context, myTimer, overrideConfig) => {
	context.log(`[SCHEDULED-JOBS][LANDING-AND-REPORTING][STARTED]`, timeNow());

	config = {...config, ...overrideConfig}

	if (myTimer.IsPastDue)
		context.log('[SCHEDULED-JOBS][LANDING-AND-REPORTING][RUNNING-LATE]', timeNow());

	if (config.instrumentationKey)
		appInsights.init(config.instrumentationKey, context);

	try {
		const cacerts = [
			fs.readFileSync(`${context.executionContext.functionDirectory}/../cabundle.pem`)
		];

		httpsAgent = new https.Agent({ ca: cacerts, keepAlive: false });
	}
	catch(err) {
		context.log('[SCHEDULED-JOBS][LANDING-AND-REPORTING][ERROR][Make sure that the CA pem bundle file named cabundle.pem]', err);
	}

	context.log(
		`[SCHEDULED-JOBS][LANDING-AND-REPORTING][CONFIG]` +
		`[url: ${config.url}][timeoutMs: ${config.timeoutMS}]` +
		`[retries: ${config.retries}][retryDelay: ${config.retryDelay}]` +
		`[instrumentationKey: ${config.instrumentationKey}]`, timeNow());

	axiosInterceptors.init(axios);

	return await retry(httpReq(context.log, config.retries), config.retries, calcDelay(config.retryDelay, config.retries))
		.then(() => {
			appInsights.trackEvent('[SCHEDULED-JOBS][LANDING-AND-REPORTING][SUCCEEDED]');
			context.log('[SCHEDULED-JOBS][LANDING-AND-REPORTING][SUCCESS]', timeNow());
		})
		.catch(e => {
			appInsights.trackEvent('[SCHEDULED-JOBS][LANDING-AND-REPORTING][FAILED]');
			context.log('[SCHEDULED-JOBS][LANDING-AND-REPORTING][ERROR][TERMINATING-RETRIES]', timeNow());
		});  
};

/**
 * Export the Azure Function.
 */
module.exports = func;