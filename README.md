# Introduction 

We have a maintenance job in the `mmo-fes-reference-data-reader` application which will find missing landings and produce reports for Case Management and Strategic Reporting.

We need this job to run every 12 hours on production (1 hour on `SND`/`TST`).

This application is based on the standard pattern for a Timer based Azure function and will call the data reader over HTTP every `X` hours *(to be configured per environment)* to trigger that maintenance job on the data reader.

By doing things this way rather than having the data reader trigger itself automatically, we can ensure that the task is only carried out by a single instance of the data reader, regardless of how many instances it is scaled up to.

Of note, if the HTTP request to the data reader fails, we will retry a number of times with an increased delay between each attempt.

# Configuration

A number of different properties should be configured in the ARM template when this application is deployed:

| Environment variable             | Required? | Default | Description                                                                                               |
| -------------------------------- | --------- | ------- | --------------------------------------------------------------------------------------------------------- |
| `CRONTIME`                       | Required  | N/A     | The cron schedule for triggering the function                                                             |
| `DATA_READER_URL`                | Required  | N/A     | The URL endpoint which triggers the maintenance job on the data reader.                                   |
| `APPINSIGHTS_INSTRUMENTATIONKEY` | Required  | N/A     | The instrumentation key for application insights.                                                         |
| `TIMEOUT_IN_MS`                  | Optional  | 600000  | The timeout in milliseconds before we class a http request as failed. Default is 10 minutes.              |
| `NUMBER_OF_RETRIES`              | Optional  | 4       | The amount of retries we should carry out after the initial call fails.                                   |
| `RETRY_DELAY_IN_MS`              | Optional  | 300000  | The amount of delay time to increment between each failed request, in milliseconds. Default is 5 minutes. |

For running locally during development, no config is required.

**Note:** 

The delay between each retry will start at 0 and increase by the value in `RETRY_DELAY_IN_MS` after each failed attempt.

So if `RETRY_DELAY_IN_MS` is set at five minutes (300000 ms):

* Initial http call - starts immediately
* Retry 1 - starts immediately after the initial call fails
* Retry 2 - waits 5 minutes before starting
* Retry 3 - waits 10 minutes before starting
* Retry 4 - waits 15 minutes before starting
...etc

# Getting Started

Install all the relevant tooling, if you haven't already:

* [Azure Function Tools](https://docs.microsoft.com/en-us/azure/azure-functions/functions-run-local?tabs=macos%2Ccsharp%2Cbash)
* [Azurite Azure Storage Emulator](https://docs.microsoft.com/en-us/azure/storage/common/storage-use-azurite)

For MacOS you can install them both using homebrew and npm:

```
# install azure function tools...
brew tap azure/functions
brew install azure-functions-core-tools@3
# if upgrading on a machine that has 2.x installed
brew link --overwrite azure-functions-core-tools@3

# install azurite azure storage emulator...
npm i -g azurite
azurite
```

Add a `local.settings.json` file to the root directory containing:

```
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "node",
		"CRONTIME": "*/1 * * * *",
    "AzureWebJobsStorage": "UseDevelopmentStorage=true"
  }
}
```

# Build and Test

```
npm install
npm test
```

# Run Locally

Ensure Azurite is running, then simply:

```
func start
```