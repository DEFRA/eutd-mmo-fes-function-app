const axios = require('axios');
const func = require('./index');
const appInsights = require('./src/appInsights');

describe('func', () => {

	let ctx;
	let mockAxios;
	let mockSetTimeout;
	let mockTrackEvent;
	let mockTrackRequest;
	let mockInitAppInsights;

	const timer = { IsPastDue: true };
	const date = new Date();
	const data = [{
		certNumber: 'GBR-2025-CC-0123456789',
		status: 'COMPLETE',
		timestamp: '2025-02-20T14:33:29.743Z'
	},{
		certNumber: 'GBR-2025-CC-0123456710',
		status: 'VOID',
		timestamp: expect.any(String)
	}]
	const networkError = new Error('Network Error');
	const mockLog = jest.fn();

	beforeEach(() => {
    ctx = {
			log: mockLog,
			done: jest.fn(),
			traceContext: {
				traceparent: 'test123'
			},
			executionContext: {
				functionDirectory: __dirname
			}
		};

		ctx.log.error = jest.fn();

		jest
			.spyOn(Date, 'now')
			.mockImplementation(() => date.valueOf());

		mockAxios = jest.spyOn(axios, 'put');
		mockAxios.mockResolvedValue({status: 200, data: 'success'});

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
		mockLog.mockReset();
		jest.restoreAllMocks();
	});

	it('should interact with MongoDB correctly', async () => {
    await func(ctx, timer, {});

		expect(mockTrackEvent).toHaveBeenNthCalledWith(2, '[SCHEDULED-JOBS][BC-RECONCILIATION][DB_NAME][local_mmo_exportcert]');
  });

	it('should make an api call to BC', async () => {

    await func(ctx, timer, {});

		expect(mockAxios).toHaveBeenCalledWith('https://eutd-mmo-bc.dev.cdp-int.defra.cloud/api/certificates', data, expect.anything());
		expect(mockAxios).toHaveBeenCalledTimes(1);
  });

	it('should retry if status code is not 200 for an api call to BC', async () => {
		mockAxios.mockResolvedValue({status: 500, data: 'Internal Server Error'});

    await func(ctx, timer, {});

		expect(mockAxios).toHaveBeenCalledWith('https://eutd-mmo-bc.dev.cdp-int.defra.cloud/api/certificates', data, expect.anything());
		expect(mockAxios).toHaveBeenCalledTimes(4);
  });

	it('should retry api calls to BC', async () => {
		mockAxios.mockRejectedValue(networkError);

    await func(ctx, timer, {});

		expect(mockAxios).toHaveBeenCalledWith('https://eutd-mmo-bc.dev.cdp-int.defra.cloud/api/certificates', data, expect.anything());
		expect(mockAxios).toHaveBeenCalledTimes(4);
  });

	it('should not log late timer', async () => {
    await func(ctx, { IsPastDue: false }, {});

		expect(mockLog).not.toHaveBeenCalledWith('[SCHEDULED-JOBS][BC-RECONCILIATION][RUNNING-LATE]', expect.anything())
  });


});