describe('appInsights', () => {

	const mockTrackEvent = jest.fn();
	const mockTrackRequest = jest.fn();
	const mockSetupInsights = jest.fn();
	const mockLog = jest.fn();
	const instrumentationKey = 'instrumentationKey123';
	const context = {operationId: 'opId', log: mockLog};

	let SUT;
	
	beforeAll(() => {
		jest.mock('applicationinsights', () => {
			return {
				setup: mockSetupInsights,
				defaultClient: {
					trackEvent: mockTrackEvent,
					trackRequest: mockTrackRequest
				}
			};
		});
	})

	beforeEach(() => {
		jest.resetModules();
		SUT = require('./appInsights');
	});

	afterEach(() => {
		mockSetupInsights.mockReset();
		mockTrackRequest.mockReset();
		mockLog.mockReset();
	})

	describe('init', () => {

		it('will initialise app insights', () => {
			SUT.init(instrumentationKey, context);

			expect(mockSetupInsights).toHaveBeenCalledWith(instrumentationKey);
		});

		it('will log app insights have been initialised', () => {
			SUT.init(instrumentationKey, context);

			expect(mockLog).toHaveBeenCalledWith(`[SCHEDULED-JOBS][LANDING-AND-REPORTING][APP-INSIGHTS][INITIALISED]`);
		});

	});

	describe('trackEvent', () => {

		const name = 'custom event';
		const properties = {property1: 'value1'};

		it('will not track a event if app insights has not been initialised', () => {
			SUT.trackEvent(name, properties);

			expect(mockTrackEvent).not.toHaveBeenCalled();
		});

		it('will track a event if app insights has been initialised', () => {
			SUT.init(instrumentationKey, context);
			SUT.trackEvent(name, properties);

			expect(mockTrackEvent).toHaveBeenCalledWith({
				name: name,
				properties: properties,
				tagOverrides: {
					'ai.operation.id': context.operationId
				}
			});			
		});

		it('will log any tracked events', () => {
			SUT.init(instrumentationKey, context);
			SUT.trackEvent(name, properties);

			const data = {
				name: name,
				properties: properties,
				tagOverrides: {'ai.operation.id': context.operationId}
			};

			expect(mockLog).toHaveBeenCalledWith(`[SCHEDULED-JOBS][LANDING-AND-REPORTING][APP-INSIGHTS][EVENT-TRACKED: ${JSON.stringify(data)}]`);
		});

	});

	describe('trackRequest', () => {

		const name = 'POST /test';
		const url = "/api/test";
		const response = {
			duration: 234,
			status: 200
		};

		it('will not track a request if app insights has not been initialised', () => {
			SUT.trackRequest(name, url, response);

			expect(mockTrackRequest).not.toHaveBeenCalled();
		});

		it('will track a request if app insights has been initialised', () => {
			SUT.init(instrumentationKey, context);
			SUT.trackRequest(name, url, response);

			expect(mockTrackRequest).toHaveBeenCalledWith({
				name: name,
				url: url,
				duration: response.duration,
				resultCode: response.status,
				success: true,
				tagOverrides: {
					'ai.operation.id': context.operationId
				}
			});
		});

		it('will track a failed request', () => {
			SUT.init(instrumentationKey, context);
			SUT.trackRequest(name, url, {duration: 100, status: 404});

			expect(mockTrackRequest).toHaveBeenCalledWith({
				name: name,
				url: url,
				duration: 100,
				resultCode: 404,
				success: false,
				tagOverrides: {
					'ai.operation.id': context.operationId
				}
			});
		});

		it('will log any tracked requests', () => {
			SUT.init(instrumentationKey, context);
			SUT.trackRequest(name, url, response);

			const data = {
				name: name,
				url: url,
				duration: response.duration,
				resultCode: response.status,
				success: true,
				tagOverrides: {'ai.operation.id': context.operationId}
			};

			expect(mockLog).toHaveBeenCalledWith(`[SCHEDULED-JOBS][LANDING-AND-REPORTING][APP-INSIGHTS][REQUEST-TRACKED: ${JSON.stringify(data)}]`);
		});

	});

});