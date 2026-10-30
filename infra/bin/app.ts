#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { GraderStack } from "../lib/grader-stack.js";

const app = new App();
new GraderStack(app, "MicrovmGraderStack", {
  env: { region: process.env.AWS_REGION ?? "ap-southeast-1" },
});
