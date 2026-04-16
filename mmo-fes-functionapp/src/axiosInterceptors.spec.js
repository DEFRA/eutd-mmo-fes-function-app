
const { performance } = require('node:perf_hooks');
const axios = require('axios');
const SUT = require('./axiosInterceptors');

const INITIAL_PERFORMANCE_NOW = 1000;
const SECOND_PERFORMANCE_NOW = 2500;
const FINAL_PERFORMANCE_NOW = 3000;
const SUCCESS_DURATION = 1500;
const ERROR_DURATION = 2000;

describe('axiosInterceptors', () => {

	let config;
	let response;
	let error;

	beforeAll(async () => {
		Object.defineProperty(performance, "now", {
			value: jest.fn(),
			configurable: true,
			writable: true
		});

		   jest
			   .spyOn(performance, 'now')
			   .mockReturnValueOnce(INITIAL_PERFORMANCE_NOW)
			   .mockReturnValueOnce(SECOND_PERFORMANCE_NOW)
			   .mockReturnValueOnce(FINAL_PERFORMANCE_NOW);
		
		SUT.init(axios);
	
		config = await axios.interceptors.request.handlers[0].fulfilled({});
		response = await axios.interceptors.response.handlers[0].fulfilled({config: config});
		error = await axios.interceptors.response.handlers[0].rejected({config: config});
	});

	it('will add a timestamp to the request config', () => {
		expect(config.meta.ts).toEqual(INITIAL_PERFORMANCE_NOW);
	});

	it('will add a duration to a success response', () => {
		expect(response.duration).toEqual(SUCCESS_DURATION);
	});

	it('will add a duration to a error response', () => {
		expect(error.duration).toEqual(ERROR_DURATION);
	});

});