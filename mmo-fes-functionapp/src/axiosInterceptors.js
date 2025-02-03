const { performance } = require('perf_hooks');

const requestInterceptor = (config) => {
	config.meta = config.meta || {};
	config.meta.ts = performance.now();
	return config;
}

const responseInterceptor = (response) => {
	response.duration = parseInt(performance.now() - response.config.meta.ts);
	return response;
}

const init = (axios) => {
  axios.interceptors.request.use(requestInterceptor);
  axios.interceptors.response.use(responseInterceptor, responseInterceptor);

	return axios;
}

module.exports = {
	init: init
}