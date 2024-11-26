const appInsights = require('applicationinsights');

let appInsightsClient;
let operationIdOverride = {};
let logFn = (str) => str;

const init = (instrumentationKey, context) => {
	operationIdOverride = {"ai.operation.id": context.operationId}

	appInsights.setup(instrumentationKey);
	appInsightsClient = appInsights.defaultClient;
	logFn = context.log;

	logFn(`[SCHEDULED-JOBS][LANDING-AND-REPORTING][APP-INSIGHTS][INITIALISED]`)
}

const trackEvent = (name, properties) => {
	if (appInsightsClient) {
		const data = {
			name: name,
			properties: properties,
			tagOverrides: operationIdOverride
		};

		appInsightsClient.trackEvent(data);
		
		logFn(`[SCHEDULED-JOBS][LANDING-AND-REPORTING][APP-INSIGHTS][EVENT-TRACKED: ${JSON.stringify(data)}]`);
	}
}

const trackRequest = (name, url, response) => {
	if (appInsightsClient) {
		const data = {
			name: name,
			url: url,
			duration: response.duration,
			resultCode: response.status,
			success: response.status === 200,
			tagOverrides: operationIdOverride
		};

		appInsightsClient.trackRequest(data);
		
		logFn(`[SCHEDULED-JOBS][LANDING-AND-REPORTING][APP-INSIGHTS][REQUEST-TRACKED: ${JSON.stringify(data)}]`);
	}
}

module.exports = {
	init: init,
	trackEvent: trackEvent,
	trackRequest: trackRequest
};