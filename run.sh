#!/bin/bash

GRAPHITE="ec2-50-112-147-23.us-west-2.compute.amazonaws.com"
# GRAPHITE="localhost"

node ./cw2graphite.js \
  --region 'us-west-2' \
  --access_key $RECOMMENDO_ENGINE_ACCESS_KEY \
  --secret_key $RECOMMENDO_ENGINE_SECRET_KEY \
  --metrics conf/metrics.json  | tee /dev/tty | nc ${GRAPHITE} 2003

