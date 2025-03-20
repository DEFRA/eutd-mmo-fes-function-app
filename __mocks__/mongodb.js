class MongoClient {
	constructor() {
    return {
			connect: jest.fn().mockResolvedValue({
			}),
			db: jest.fn().mockReturnValue({
				collection: jest.fn().mockReturnValue({
					find: jest.fn().mockReturnValue({
						toArray: jest.fn().mockResolvedValue([{
							documentNumber: 'GBR-2025-CC-0123456789',
							status: 'COMPLETE',
							createdAt: '2025-02-20T14:33:29.743Z',
						},{
							documentNumber: 'GBR-2025-CC-0123456710',
							status: 'VOID',
							createdAt: '2025-02-20T14:33:29.743Z',
						}]),
					}),
					insertOne: jest.fn().mockResolvedValue({ insertedId: 'mocked_id' }),
				}),
			}),
			close: jest.fn().mockResolvedValue(true),
		}
  }
}

module.exports = { MongoClient };