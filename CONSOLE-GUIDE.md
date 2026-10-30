# Deploy and test from the console

Account 498556006298, region ap-southeast-1, profile `madhavmain`. The image `grader-image` (v4.0), the S3 bucket and the build role already exist. Only the grader Lambda is left.

## A. Deploy the grader Lambda (you run this)

```bash
cd ~/Desktop/microvm-grader
set -a; source .env; set +a        # loads GRADER_IMAGE_ARN, DEMO_SECRET
cd infra
npx cdk deploy --profile madhavmain
```

Answer `y` to the IAM changes prompt. At the end it prints `GraderUrl`. Add it to `.env` as `GRADER_URL=...` (optional, only for `--remote`).

If `cdk deploy` fails with "set GRADER_IMAGE_ARN and DEMO_SECRET", the `source .env` step did not run in the same shell.

## B. Generate the console test events

```bash
cd ~/Desktop/microvm-grader     # repo ROOT, not infra/ (npm would look for the script in the infra workspace)
npm run events        # writes out/events/*.json (contains DEMO_SECRET; out/ is gitignored)
```

## C. Test in the Lambda console

1. Console → Lambda → Functions → open the function whose name starts with `MicrovmGraderStack-Grader`.
2. **Test** tab → *Create new event* → name it `two_sum` → paste the contents of `out/events/two_sum.json` → **Save** → **Test**.
3. Expected: status 200 and a body with `"verdict":"ACCEPTED"`, `passed:5`, `microvmId`, `timings`.
4. Repeat for the rest, in this order:
   `wrong` (WRONG_ANSWER 3/5), `infinite_loop` (TIMEOUT), `fork_bomb` (ERROR), `memory_bomb` (ERROR), `rm_rf` (ERROR), `exfil` (ERROR), `read_answers` (WRONG_ANSWER), `kill_runner` (ERROR), then `two_sum` again (ACCEPTED).
5. Each run takes about 4 to 17 s. The function timeout is 90 s.

If you see a 502 `grading failed`, open the **Monitor → View CloudWatch logs** tab. Likely cause: the Lambda's IAM policy for `lambda:RunMicrovm`. The error message names the exact ARN it wants; add it to the stack in `infra/lib/grader-stack.ts` and redeploy.

## C2. Demo UI (Function URL)

Open the `GraderUrl` printed by `cdk deploy` in a browser. Pick the problem, pick a sample (correct, wrong, or one of the 7 attacks), edit the code if you like, paste `DEMO_SECRET` from `.env` once, press **Run in a MicroVM**. The page shows the verdict, per-test output and stderr, the four timings and the MicroVM id. A failed run shows the real error text instead of a bare 502.

## D. Screens to record

1. Lambda → MicroVMs → Images → `grader-image`: state `UPDATED`, version 4.0, build logs.
2. Lambda function → **Test** tab: run the nine events above.
3. Lambda → MicroVMs list (or `npm run cleanup` in a terminal): each test is one VM, all `TERMINATED`.
4. CloudWatch: the function's log group (structured `graded` / `verdict` lines with `microvmId` and timings) and `/aws/lambda-microvms/grader-image`.
5. Terminal (optional): `PAUSE_MS=800 npm run attack` for the aligned verdict lines. Its timings are saved in `out/attack-*.json`.

## E. Clean up after recording

```bash
cd ~/Desktop/microvm-grader/infra && npx cdk destroy --profile madhavmain
aws lambda-microvms delete-microvm-image --image-identifier arn:aws:lambda:ap-southeast-1:498556006298:microvm-image:grader-image --region ap-southeast-1 --profile madhavmain
aws s3 rb s3://mvm-grader-498556006298-apse1 --force --profile madhavmain
aws iam delete-role-policy --role-name mvm-grader-build --policy-name build --profile madhavmain
aws iam delete-role --role-name mvm-grader-build --profile madhavmain
```

Optional: delete the `CDKToolkit` stack and its asset bucket if you will not use CDK again.
