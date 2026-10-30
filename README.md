# MicroVM Grader: run untrusted code in AWS Lambda MicroVMs

A LeetCode-style grader. Each submission runs in its own throwaway Lambda MicroVM with no outbound network.
Built for a conference talk; the demo is recorded, not live.

```
 you ──► grader (trusted: your laptop or a Lambda)
           │ 1 RunMicrovm        (60 s cap, no egress, no execution role)
           │ 2 CreateMicrovmAuthToken (2 min, port 8080 only)
           │ 3 POST /grade  {code, inputs}        ← expected answers are NEVER sent
           ▼
        MicroVM (untrusted): runner → python3 as uid 1001, 2 s, 64 procs, 512 MB
           │ 4 [{status, stdout, stderr, ms}]
           ▼
 grader compares stdout with the expected answers, then ALWAYS TerminateMicrovm
```

## Facts verified against the SDK / CLI (and where the brief differed)

| Item | Result |
|---|---|
| SDK `@aws-sdk/client-lambda-microvms` 3.1159.0, `aws lambda-microvms` (CLI 2.35.24) | exist |
| `RunMicrovm`, `CreateMicrovmAuthToken`, `TerminateMicrovm`, `ListMicrovms` | match the brief |
| Hooks | **opt-in at image creation** (`--hooks`); the script enables `run`, `ready`, `validate` |
| Base image `dnf` | it is **microdnf**; installs **Node 18** (no `nodejs20`) and Python 3.9. Runner is bundled for node18 |
| Base image ARN (ap-southeast-1) | `arn:aws:lambda:ap-southeast-1:aws:microvm-image:al2023-1` (from `list-managed-microvm-images`) |
| Extra API | `CreateMicrovmShellAuthToken` needs the `SHELL_INGRESS` connector (not used) |

**Unverified (guesses, marked in the files).** Check these in the console before relying on them:
1. ~~Egress~~: resolved. Empty list = internet ON; the runner blocks it in-VM (step 7).
2. ~~Ingress connector~~: resolved. The service defaults to `HTTP_INGRESS`; grading works.
3. IAM resource ARNs in `iam/*.json` (`microvm-image:`, `microvm:`) and the build-role trust principal (`lambda.amazonaws.com`).
   If `run-microvm` or the build says AccessDenied, copy the ARN or principal from the error or the console.

## 1. Prerequisites

- AWS CLI ≥ 2.35 with `lambda-microvms` (`aws lambda-microvms help`), profile `madhav`, region `ap-southeast-1`
- Node ≥ 20.18, Docker (Apple Silicon or buildx for `linux/arm64`), `zip`
- An S3 bucket in ap-southeast-1 for the code zip

```bash
npm install
cp .env.example .env     # fill in as you go
```

## 2. Local test (no AWS, no cost)

```bash
npm test                 # 15 unit tests
npm run local:runner     # builds the arm64 image, runs it on localhost:8080
npm run local:attack     # 9 steps, expect "All contained: 9/9"
docker stop mvm-runner
```

Local Docker is **not** the isolation boundary. It only proves the limits and the protocol work.
`exfil.py` is accepted as WRONG_ANSWER locally because Docker has internet; the real check is step 7.

## 3. Package

```bash
npm run package:image    # → grader-image.zip (Dockerfile + dist/server.js)
```

## 4. Create the build role, upload, create the image

Create the build role once (console or CLI). Replace `REPLACE_BUCKET` / `REPLACE_ACCOUNT` in `iam/image-build-role.policy.json` first.

```bash
aws iam create-role --profile madhav --role-name mvm-grader-build \
  --assume-role-policy-document file://iam/image-build-role.trust.json
aws iam put-role-policy --profile madhav --role-name mvm-grader-build \
  --policy-name build --policy-document file://iam/image-build-role.policy.json
```

Put the role ARN in `.env` as `BUILD_ROLE_ARN` and set `S3_BUCKET`, then:

```bash
bash scripts/upload-and-create-image.sh
```

The script prints `imageArn`. Put it in `.env` as `GRADER_IMAGE_ARN`.
The MicroVM itself gets **no execution role**.

## 5. Wait for the build

```bash
aws logs tail /aws/lambda/microvms/grader-image --follow --region ap-southeast-1 --profile madhav
aws lambda-microvms get-microvm-image --image-identifier grader-image --region ap-southeast-1 --profile madhav --query state
```

Wait for `CREATED`. On `CREATE_FAILED`, read the log (usual causes: role trust/permissions, a hook returning non-200).

## 6. Run the grader (CLI)

```bash
npm run submit -- solutions/two_sum.py     # ACCEPTED 5/5
npm run submit -- solutions/wrong.py       # WRONG_ANSWER 3/5
```

## 7. VERIFY NO EGRESS: do this BEFORE recording

**Finding from the real deploy:** passing `egressNetworkConnectors: []` does NOT remove outbound access. The platform
falls back to `INTERNET_EGRESS` (the first build let `exfil.py` fetch example.com with HTTP 200), and no "no egress"
managed connector name was accepted. So the runner cuts the network itself: each test runs under `unshare --net`
(empty network namespace), then `setpriv` drops to uid 1001, then `prlimit`. This needs `additionalOsCapabilities: ["ALL"]`
on the image (already set in the script). Confirmed on the real image: `exfil.py` → ERROR, "Name or service not known".
Ingress was reported as `HTTP_INGRESS` by the service, and grading worked, so the `ALL_INGRESS` default is not needed.

```bash
npm run submit -- payloads/exfil.py
```

It must say `ERROR`, and the test output shows `exfil blocked` on stderr. If it says `EXFIL SUCCEEDED`, or the verdict is
WRONG_ANSWER, the VM has internet. Do not record. Look in the console/CLI for the correct "no egress" setting
(`INTERNET_EGRESS` is the managed connector that *grants* it; check what the image and the VM actually have attached),
set `EGRESS_CONNECTORS` / the image's `egressNetworkConnectors` accordingly, rebuild, and re-test.

## 8. Run the demo

```bash
PAUSE_MS=800 npm run attack    # correct → 7 payloads → correct again; saves out/attack-<time>.json
npm run parallel               # two submissions at once → two different microvm IDs
```

Expected: ACCEPTED, TIMEOUT, ERROR/KILLED ×2, ERROR ×3, WRONG_ANSWER (read_answers finds nothing), ACCEPTED.
Every line ends with ✓; any `✗ UNEXPECTED` means a defence did not hold.

### Console recording plan (the demo is shown through the AWS console and recorded)

The CLI/SDK shapes suggest the console shows images, builds and VMs, but I could not confirm the console screens from docs.
Open the console and adjust this list to what you see. Suggested shot order:

1. **Image**: Lambda → MicroVM images → `grader-image`: state `CREATED`, build logs, snapshot sizes, hooks, egress setting.
2. **Terminal**: `PAUSE_MS=800 npm run attack` (the verdict lines are the story; the console cannot POST code to `/grade`).
3. **MicroVMs list**: each submission is one VM ID; all show `TERMINATED`.
4. **CloudWatch**: `/aws/lambda/microvms/grader-image`, the `run-hook` log lines (one per VM).
5. **Slides**: timings from `out/attack-*.json` (`launchMs`, `tokenMs`, `gradeMs`, `terminateMs`).

Optional (step 9): the Lambda console **Test** tab can invoke the grader with
`{"requestContext":{"http":{"method":"POST"}},"rawPath":"/submit","headers":{"x-demo-secret":"<secret>"},"body":"{\"problemId\":\"two-sum\",\"code\":\"...\"}"}`
for a console-only grading shot.

## 9. Optional: deploy the grader as a Lambda (CDK)

CDK over SAM: same language as the repo, esbuild bundling built in, ~60 lines. MicroVM images have no CDK construct,
so image creation stays in the script.

```bash
cd infra
export GRADER_IMAGE_ARN=... DEMO_SECRET="$(openssl rand -hex 16)"
npx cdk bootstrap --profile madhav   # once per account/region
npx cdk deploy --profile madhav
```

Put the `GraderUrl` output in `.env` as `GRADER_URL` (and the same `DEMO_SECRET`), then `npm run submit -- solutions/two_sum.py --remote`.
Auth is demo-grade: Function URL with auth `NONE` plus a shared-secret header (`x-demo-secret`), compared in constant time.
Delete the stack after the talk.

IAM: `iam/grader-role.policy.json` documents the least-privilege policy the stack attaches
(`lambda:ListMicrovms` needs `Resource: "*"` because list actions are not resource-scoped).

## 10. Clean up

```bash
npm run cleanup                                   # lists + terminates running grader VMs (asks first)
aws lambda-microvms delete-microvm-image --image-identifier grader-image --region ap-southeast-1 --profile madhav
cd infra && npx cdk destroy --profile madhav      # if you deployed it
aws s3 rm s3://$S3_BUCKET/grader-image.zip --profile madhav
aws iam delete-role-policy --role-name mvm-grader-build --policy-name build --profile madhav
aws iam delete-role --role-name mvm-grader-build --profile madhav
```

## Recording checklist

- [ ] Step 7 passed (`exfil.py` → ERROR, "exfil blocked") on the **same image** you record with
- [ ] `npm run cleanup` shows no running VMs
- [ ] Terminal: ≥ 120 columns, large font, `PAUSE_MS=800`, dark theme
- [ ] One dry run of `npm run attack`, then the real take
- [ ] Keep `out/attack-*.json` for the slide timings
- [ ] Console tabs pre-opened: image, MicroVM list, CloudWatch log group

## Cost

Each VM is capped at 60 s (`maximumDurationInSeconds`) and always terminated in a `finally`. A full `attack` run is 9 short VMs.
Image storage and the S3 zip cost cents. Delete everything in step 10.

## Why the answers never enter the VM

The runner only receives `code` and `inputs`. Comparison happens in `grader/src/compare.ts`, on the trusted side. Even a fully
compromised runner can only lie about *its own* output; it cannot read the answers (`payloads/read_answers.py`).
The runner's reply is also treated as hostile: size-capped, zod-validated, and control characters stripped before printing.

## Snapshot caveat

The VM is restored from a memory snapshot, so anything random generated at build time repeats in every VM.
The `run` hook re-seeds (`PYTHONHASHSEED`) per VM.
