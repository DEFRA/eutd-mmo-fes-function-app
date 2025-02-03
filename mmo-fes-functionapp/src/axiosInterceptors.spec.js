const { performance } = require('perf_hooks');
const axios = require('axios');
const SUT = require('./axiosInterceptors');

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
			.mockReturnValueOnce(1000)
			.mockReturnValueOnce(2500)
			.mockReturnValueOnce(3000);
		
		SUT.init(axios);
	
		config = await axios.interceptors.request.handlers[0].fulfilled({});
		response = await axios.interceptors.response.handlers[0].fulfilled({config: config});
		error = await axios.interceptors.response.handlers[0].rejected({config: config});
	});

	it('will add a timestamp to the request config', () => {
		expect(config.meta.ts).toEqual(1000);
	});

	it('will add a duration to a success response', () => {
		expect(response.duration).toEqual(1500);
	});

	it('will add a duration to a error response', () => {
		expect(error.duration).toEqual(2000);
	});

});