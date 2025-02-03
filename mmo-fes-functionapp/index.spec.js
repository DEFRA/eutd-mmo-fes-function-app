const axios = require('axios');
const func = require('./index');
const appInsights = require('./src/appInsights');

const minsToMs = (mins) => mins * 60 * 1000;

describe('func', () => {

	let ctx;
	let mockAxios;
	let mockSetTimeout;
	let mockTrackEvent;
	let mockTrackRequest;
	let mockInitAppInsights;

  const timer = { IsPastDue: true };
	const date = new Date();
	const dateNow = date.toISOString();
	const networkError = new Error('Network Error');

	beforeEach(() => {
    ctx = {
			log: jest.fn(),
			done: jest.fn(),
			traceContext: {
				traceparent: 'test123'
			},
			executionContext: {
				functionDirectory: __dirname
			}
		};

		jest
			.spyOn(Date, 'now')
			.mockImplementation(() => date.valueOf());

		mockAxios = jest.spyOn(axios, 'post');

		mockSetTimeout = jest.spyOn(global, 'setTimeout')
			.mockImplementation((callback, _delay) => callback());

		mockTrackEvent = jest.spyOn(appInsights, 'trackEvent')
			.mockReturnValue(null);

		mockTrackRequest = jest.spyOn(appInsights, 'trackRequest')
			.mockReturnValue(null);

		mockInitAppInsights = jest.spyOn(appInsights, 'init')
			.mockReturnValue(null);
	});
	
	afterEach(() => {
		jest.restoreAllMocks();
	});

  it('will call done after getting a response from axios', async () => {
		mockAxios
			.mockResolvedValue(null);

		await func(ctx, timer);
		
		expect(mockAxios).toHaveBeenCalledTimes(1);
		
		expect(ctx.done).not.toHaveBeenCalled();
  });

  it('will retry if the axios call fails', async () => {
		mockAxios
			.mockRejectedValueOnce(networkError)
			.mockResolvedValue(null);

		await func(ctx, timer);
		
		expect(mockAxios).toHaveBeenCalledTimes(2);

		expect(ctx.done).not.toHaveBeenCalled();
	});

  it('will retry 4 more times after the initial call', async () => {
		mockAxios
			.mockRejectedValueOnce(networkError)
			.mockRejectedValueOnce(networkError)
			.mockRejectedValueOnce(networkError)
			.mockRejectedValueOnce(networkError)
			.mockResolvedValue(null);

		await func(ctx, timer);
		
		expect(mockAxios).toHaveBeenCalledTimes(5);

		expect(ctx.done).not.toHaveBeenCalled();
	});

  it('will give up after the 5th failed attempt', async () => {
		mockAxios
			.mockRejectedValue(networkError);

		await func(ctx, timer);
		
		expect(mockAxios).toHaveBeenCalledTimes(5);

		expect(ctx.done).not.toHaveBeenCalled();
	});
	
	it('will retry immediately after the first failure', async () => {
		mockAxios
			.mockRejectedValueOnce(networkError)
			.mockResolvedValue(null);

		await func(ctx, timer);
		
		expect(mockAxios).toHaveBeenCalledTimes(2);

		expect(mockSetTimeout).toHaveBeenCalledTimes(1);
		expect(mockSetTimeout).toHaveBeenNthCalledWith(1, expect.anything(), 0);

		expect(ctx.done).not.toHaveBeenCalled();
	});
	
	it('will increase the delay between each failed attempt', async () => {
		mockAxios
			.mockRejectedValue(networkError);

		await func(ctx, timer);
		
		expect(mockAxios).toHaveBeenCalledTimes(5);

		expect(mockSetTimeout).toHaveBeenCalledTimes(4);
		expect(mockSetTimeout).toHaveBeenNthCalledWith(1, expect.anything(), 0);
		expect(mockSetTimeout).toHaveBeenNthCalledWith(2, expect.anything(), minsToMs(5));
		expect(mockSetTimeout).toHaveBeenNthCalledWith(3, expect.anything(), minsToMs(10));
		expect(mockSetTimeout).toHaveBeenNthCalledWith(4, expect.anything(), minsToMs(15));

		expect(ctx.done).not.toHaveBeenCalled();
	});

  it('will log a successful run', async () => {
		mockAxios
			.mockRejectedValueOnce(networkError)
			.mockRejectedValueOnce(networkError)
			.mockRejectedValueOnce(networkError)
			.mockRejectedValueOnce(networkError)
			.mockResolvedValue(null);

		await func(ctx, timer);
		
		expect(ctx.log).toHaveBeenNthCalledWith(1, '[SCHEDULED-JOBS][LANDING-AND-REPORTING][STARTED]', dateNow);
		expect(ctx.log).toHaveBeenNthCalledWith(2, '[SCHEDULED-JOBS][LANDING-AND-REPORTING][RUNNING-LATE]', dateNow);
		expect(ctx.log).toHaveBeenNthCalledWith(3, '[SCHEDULED-JOBS][LANDING-AND-REPORTING][CONFIG][url: http://localhost:9000/v1/jobs/landings][timeoutMs: 600000][retries: 4][retryDelay: 300000][instrumentationKey: null]', dateNow);
		expect(ctx.log).toHaveBeenNthCalledWith(4, '[SCHEDULED-JOBS][LANDING-AND-REPORTING][MAKING-HTTP-CALL][ATTEMPT-1]', dateNow);
		expect(ctx.log).toHaveBeenNthCalledWith(5, '[SCHEDULED-JOBS][LANDING-AND-REPORTING][ERROR][ATTEMPT-1]', dateNow, networkError);
		expect(ctx.log).toHaveBeenNthCalledWith(6, '[SCHEDULED-JOBS][LANDING-AND-REPORTING][MAKING-HTTP-CALL][ATTEMPT-2]', dateNow);
		expect(ctx.log).toHaveBeenNthCalledWith(7, '[SCHEDULED-JOBS][LANDING-AND-REPORTING][ERROR][ATTEMPT-2]', dateNow, networkError);
		expect(ctx.log).toHaveBeenNthCalledWith(8, '[SCHEDULED-JOBS][LANDING-AND-REPORTING][MAKING-HTTP-CALL][ATTEMPT-3]', dateNow);
		expect(ctx.log).toHaveBeenNthCalledWith(9, '[SCHEDULED-JOBS][LANDING-AND-REPORTING][ERROR][ATTEMPT-3]', dateNow, networkError);
		expect(ctx.log).toHaveBeenNthCalledWith(10, '[SCHEDULED-JOBS][LANDING-AND-REPORTING][MAKING-HTTP-CALL][ATTEMPT-4]', dateNow);
		expect(ctx.log).toHaveBeenNthCalledWith(11, '[SCHEDULED-JOBS][LANDING-AND-REPORTING][ERROR][ATTEMPT-4]', dateNow, networkError);
		expect(ctx.log).toHaveBeenNthCalledWith(12, '[SCHEDULED-JOBS][LANDING-AND-REPORTING][MAKING-HTTP-CALL][ATTEMPT-5]', dateNow);
		expect(ctx.log).toHaveBeenNthCalledWith(13, '[SCHEDULED-JOBS][LANDING-AND-REPORTING][SUCCESS]', dateNow);
		expect(ctx.log).toHaveBeenCalledTimes(13);

		expect(ctx.done).not.toHaveBeenCalled();
  });

  it('will log a failed run', async () => {
		mockAxios
			.mockRejectedValue(networkError);

		await func(ctx, timer);
		
		expect(ctx.log).toHaveBeenNthCalledWith(1, '[SCHEDULED-JOBS][LANDING-AND-REPORTING][STARTED]', dateNow);
		expect(ctx.log).toHaveBeenNthCalledWith(2, '[SCHEDULED-JOBS][LANDING-AND-REPORTING][RUNNING-LATE]', dateNow);
		expect(ctx.log).toHaveBeenNthCalledWith(3, '[SCHEDULED-JOBS][LANDING-AND-REPORTING][CONFIG][url: http://localhost:9000/v1/jobs/landings][timeoutMs: 600000][retries: 4][retryDelay: 300000][instrumentationKey: null]', dateNow);
		expect(ctx.log).toHaveBeenNthCalledWith(4, '[SCHEDULED-JOBS][LANDING-AND-REPORTING][MAKING-HTTP-CALL][ATTEMPT-1]', dateNow);
		expect(ctx.log).toHaveBeenNthCalledWith(5, '[SCHEDULED-JOBS][LANDING-AND-REPORTING][ERROR][ATTEMPT-1]', dateNow, networkError);
		expect(ctx.log).toHaveBeenNthCalledWith(6, '[SCHEDULED-JOBS][LANDING-AND-REPORTING][MAKING-HTTP-CALL][ATTEMPT-2]', dateNow);
		expect(ctx.log).toHaveBeenNthCalledWith(7, '[SCHEDULED-JOBS][LANDING-AND-REPORTING][ERROR][ATTEMPT-2]', dateNow, networkError);
		expect(ctx.log).toHaveBeenNthCalledWith(8, '[SCHEDULED-JOBS][LANDING-AND-REPORTING][MAKING-HTTP-CALL][ATTEMPT-3]', dateNow);
		expect(ctx.log).toHaveBeenNthCalledWith(9, '[SCHEDULED-JOBS][LANDING-AND-REPORTING][ERROR][ATTEMPT-3]', dateNow, networkError);
		expect(ctx.log).toHaveBeenNthCalledWith(10, '[SCHEDULED-JOBS][LANDING-AND-REPORTING][MAKING-HTTP-CALL][ATTEMPT-4]', dateNow);
		expect(ctx.log).toHaveBeenNthCalledWith(11, '[SCHEDULED-JOBS][LANDING-AND-REPORTING][ERROR][ATTEMPT-4]', dateNow, networkError);
		expect(ctx.log).toHaveBeenNthCalledWith(12, '[SCHEDULED-JOBS][LANDING-AND-REPORTING][MAKING-HTTP-CALL][ATTEMPT-5]', dateNow);
		expect(ctx.log).toHaveBeenNthCalledWith(13, '[SCHEDULED-JOBS][LANDING-AND-REPORTING][ERROR][ATTEMPT-5]', dateNow, networkError);
		expect(ctx.log).toHaveBeenNthCalledWith(14, '[SCHEDULED-JOBS][LANDING-AND-REPORTING][ERROR][TERMINATING-RETRIES]', dateNow);
		expect(ctx.log).toHaveBeenCalledTimes(14);

		expect(ctx.done).not.toHaveBeenCalled();
	});

  it('will not setup app insights if a instrumentation key is not present', async () => {
		mockAxios
			.mockResolvedValue(null);

		await func(ctx, timer);
		
		expect(mockInitAppInsights).not.toHaveBeenCalled();
	});

  it('will setup app insights if a instrumentation key is present', async () => {
		mockAxios
			.mockResolvedValue(null);

		const instrumentationKey = 'instrumentationKey123';

		await func(ctx, timer, {instrumentationKey: instrumentationKey});
		
		expect(mockInitAppInsights).toHaveBeenCalledWith(instrumentationKey, ctx);
		expect(ctx.log).toHaveBeenCalledWith(`[SCHEDULED-JOBS][LANDING-AND-REPORTING][CONFIG][url: http://localhost:9000/v1/jobs/landings][timeoutMs: 600000][retries: 4][retryDelay: 300000][instrumentationKey: ${instrumentationKey}]`, dateNow);
	});

  it('will track a failure event if all http calls fail', async () => {
		mockAxios
			.mockRejectedValue(networkError);

		await func(ctx, timer);
		
		expect(mockTrackEvent).toHaveBeenCalledTimes(1);
		expect(mockTrackEvent).toHaveBeenCalledWith('[SCHEDULED-JOBS][LANDING-AND-REPORTING][FAILED]');
	});

  it('will track a success event if a http call succeeds', async () => {
		mockAxios
			.mockRejectedValueOnce(networkError)
			.mockRejectedValueOnce(networkError)
			.mockResolvedValue('success');

		await func(ctx, timer);
		
		expect(mockTrackEvent).toHaveBeenCalledTimes(1);
		expect(mockTrackEvent).toHaveBeenCalledWith('[SCHEDULED-JOBS][LANDING-AND-REPORTING][SUCCEEDED]');
	});

  it('will track http requests for all successful and failed axios calls', async () => {
		mockAxios
			.mockRejectedValueOnce(networkError)
			.mockRejectedValueOnce(networkError)
			.mockResolvedValue('success');

		const url = 'test/123'

		await func(ctx, timer, {url: url});
		
		expect(mockTrackRequest).toHaveBeenCalledTimes(3);
		expect(mockTrackRequest).toHaveBeenNthCalledWith(1, 'POST /v1/jobs/landings', url, networkError);
		expect(mockTrackRequest).toHaveBeenNthCalledWith(2, 'POST /v1/jobs/landings', url, networkError);
		expect(mockTrackRequest).toHaveBeenNthCalledWith(3, 'POST /v1/jobs/landings', url, 'success');
	});

});