import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { Architecture, FunctionUrlAuthType, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Why CDK (not SAM): same language as the rest of the repo, esbuild bundling is built in,
// and the stack stays ~40 lines. MicroVM *images* have no CDK construct, so the image is
// created by scripts/upload-and-create-image.sh.
export class GraderStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
    const imageArn = process.env.GRADER_IMAGE_ARN ?? "";
    const secret = process.env.DEMO_SECRET ?? "";
    if (!imageArn || secret.length < 16) {
      throw new Error("set GRADER_IMAGE_ARN and DEMO_SECRET (>=16 chars) before cdk deploy");
    }

    const fn = new NodejsFunction(this, "Grader", {
      entry: join(root, "grader/src/handler.ts"),
      handler: "handler",
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(90),
      logGroup: new LogGroup(this, "GraderLogs", { retention: RetentionDays.ONE_WEEK, removalPolicy: RemovalPolicy.DESTROY }),
      environment: {
        GRADER_IMAGE_ARN: imageArn,
        DEMO_SECRET: secret,
        PROBLEMS_DIR: "/var/task/problems",
        SAMPLES_DIR: "/var/task", // solutions/ and payloads/ for the demo UI
        UI_DIR: "/var/task/ui",
        INGRESS_CONNECTORS: process.env.INGRESS_CONNECTORS ?? "",
        EGRESS_CONNECTORS: "", // never give the grader VM outbound access
      },
      bundling: {
        format: OutputFormat.ESM,
        mainFields: ["module", "main"],
        // the Lambda runtime SDK does not include the MicroVMs client: bundle it
        externalModules: [],
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (input, output) => [
          `cp -r ${input}/problems ${output}/problems`,
          `cp -r ${input}/solutions ${output}/solutions`,
          `cp -r ${input}/payloads ${output}/payloads`,
          `cp -r ${input}/grader/ui ${output}/ui`,
        ],
        },
      },
    });

    fn.addToRolePolicy(
      new PolicyStatement({
        actions: [
          "lambda:RunMicrovm",
          "lambda:CreateMicrovmAuthToken",
          "lambda:TerminateMicrovm",
          "lambda:GetMicrovm",
        ],
        resources: [imageArn, `arn:aws:lambda:${this.region}:${this.account}:microvm:*`],
      }),
    );
    fn.addToRolePolicy(new PolicyStatement({ actions: ["lambda:ListMicrovms"], resources: ["*"] }));
    // RunMicrovm checks PassNetworkConnector for every connector attached, including the platform
    // defaults (INTERNET_EGRESS, HTTP_INGRESS) even when we ask for none. Egress is cut inside the
    // VM by the runner (unshare --net), so allowing this connector does not give the code a network.
    fn.addToRolePolicy(
      new PolicyStatement({
        actions: ["lambda:PassNetworkConnector"],
        resources: [`arn:aws:lambda:${this.region}:aws:network-connector:aws-network-connector:*`],
      }),
    );

    // Auth NONE + shared-secret header checked in the handler (demo-grade).
    const url = fn.addFunctionUrl({ authType: FunctionUrlAuthType.NONE });
    new CfnOutput(this, "GraderUrl", { value: url.url });
  }
}
