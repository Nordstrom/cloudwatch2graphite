#!/bin/bash

GRAPHITE="localhost"

node ./cw2graphite.js \
  --region 'us-west-2' \
  --access_key $RECOMMENDO_ENGINE_ACCESS_KEY \
  --secret_key $RECOMMENDO_ENGINE_SECRET_KEY \
  --metrics conf/metrics.json  | tee /dev/tty | nc ${GRAPHITE} 2003

