#!/bin/bash
set -euxo pipefail
# First install package dependencies (including typescript) for sonarqube:
if [[ "$BUILD_REASON" == "PullRequest" ]]
then
    echo "sonar.pullrequest.branch=pr/$SYSTEM_PULLREQUEST_PULLREQUESTID" >> sonar-project.properties
    echo "sonar.pullrequest.base=${SYSTEM_PULLREQUEST_TARGETBRANCH#*/*/}" >> sonar-project.properties
    echo "sonar.pullrequest.key=$SYSTEM_PULLREQUEST_PULLREQUESTID" >> sonar-project.properties
    echo "sonar.pullrequest.vsts.instanceUrl=$SYSTEM_TEAMFOUNDATIONCOLLECTIONURI" >> sonar-project.properties
    echo "sonar.pullrequest.vsts.project=$SYSTEM_TEAMPROJECT" >> sonar-project.properties
    echo "sonar.pullrequest.vsts.repository=$BUILD_REPOSITORY_NAME" >> sonar-project.properties
    echo "sonar.pullrequest.provider=vsts" >> sonar-project.properties
else
    echo "sonar.branch.name=${BUILD_SOURCEBRANCH#*/*/}" >> sonar-project.properties
    case $BUILD_SOURCEBRANCH in
    "refs/heads/develop")
        echo "Running on develop"
        echo "sonar.branch.target=master" >> sonar-project.properties
        ;;
    "refs/heads/master")
        echo "Running on master"
        ;;
    *)
        echo "sonar.branch.target=develop" >> sonar-project.properties
        ;;
    esac
fi
echo "sonar.javascript.lcov.reportPath=./coverage/lcov.info" >> sonar-project.properties
echo "sonar-project.properties as follows:"
echo "----"
cat sonar-project.properties
echo "----"
docker run \
    --rm \
    -e SONAR_HOST_URL="https://vss-sonarqube.azure.defra.cloud" \
    -e SONAR_LOGIN="$VSSAPIKEY" \
    -v "$BUILD_REPOSITORY_LOCALPATH:/usr/src" \
    --user "$(id -u):$(id -g)" \
    sonarsource/sonar-scanner-cli