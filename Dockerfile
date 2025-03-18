ARG GIT_HASH=""

FROM mcr.microsoft.com/azure-functions/node:4-node22

ENV AzureWebJobsScriptRoot=/home/site/wwwroot \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true
RUN echo $GIT_HASH > githash
COPY --chown=root:root . /home/site/wwwroot

RUN cd /home/site/wwwroot && \
    npm install --only-prd
