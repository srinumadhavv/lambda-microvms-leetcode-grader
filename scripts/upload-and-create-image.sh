#!/usr/bin/env bash
# Uploads grader-image.zip to S3 and starts the MicroVM image build.
# CREATES AWS RESOURCES (S3 object, MicroVM image). Run it yourself after reading it.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a

: "${S3_BUCKET:?set S3_BUCKET in .env}" "${BUILD_ROLE_ARN:?set BUILD_ROLE_ARN in .env}"
: "${BASE_IMAGE_ARN:?}" "${IMAGE_NAME:?}" "${AWS_REGION:?}" "${S3_KEY:=grader-image.zip}"
MEM="${IMAGE_MEMORY_MIB:-1024}"
[ -f grader-image.zip ] || { echo "run: npm run package:image first" >&2; exit 1; }

aws s3 cp grader-image.zip "s3://${S3_BUCKET}/${S3_KEY}" --region "$AWS_REGION"

# Input JSON so the empty egress list is explicit (no outbound connectors).
INPUT="$(mktemp)"
cat > "$INPUT" <<JSON
{
  "name": "${IMAGE_NAME}",
  "baseImageArn": "${BASE_IMAGE_ARN}",
  "buildRoleArn": "${BUILD_ROLE_ARN}",
  "codeArtifact": { "uri": "s3://${S3_BUCKET}/${S3_KEY}" },
  "cpuConfigurations": [{ "architecture": "ARM_64" }],
  "resources": [{ "minimumMemoryInMiB": ${MEM} }],
  "egressNetworkConnectors": [],
  "additionalOsCapabilities": ["ALL"],
  "hooks": {
    "port": 8080,
    "microvmHooks": { "run": "ENABLED", "runTimeoutInSeconds": 30 },
    "microvmImageHooks": {
      "ready": "ENABLED", "readyTimeoutInSeconds": 120,
      "validate": "ENABLED", "validateTimeoutInSeconds": 120
    }
  }
}
JSON

aws lambda-microvms create-microvm-image --region "$AWS_REGION" --cli-input-json "file://${INPUT}" | tee /tmp/create-image.out
rm -f "$INPUT"

cat <<EOF

Build started. Put the "imageArn" above into .env as GRADER_IMAGE_ARN.
Watch the build:
  aws logs tail /aws/lambda/microvms/${IMAGE_NAME} --follow --region ${AWS_REGION}
  aws lambda-microvms get-microvm-image --image-identifier ${IMAGE_NAME} --region ${AWS_REGION} --query state
  (wait for state CREATED; CREATE_FAILED => read the log above)
EOF
