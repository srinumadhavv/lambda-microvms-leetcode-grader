export interface Config {
  region: string;
  imageArn: string;
  ingress: string[];
  egress: string[];
}

const list = (v: string | undefined): string[] =>
  (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const region = env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? "ap-southeast-1";
  const imageArn = env.GRADER_IMAGE_ARN;
  if (!imageArn) throw new Error("GRADER_IMAGE_ARN is not set (see .env.example)");
  return {
    region,
    imageArn,
    // VERIFY: connector ARN format. Copy the real one from the console if run-microvm rejects it.
    ingress: list(env.INGRESS_CONNECTORS).length
      ? list(env.INGRESS_CONNECTORS)
      : [`arn:aws:lambda:${region}:aws:network-connector:aws-network-connector:ALL_INGRESS`],
    // Empty list = no egress connector attached. VERIFY BEFORE DEMO with payloads/exfil.py.
    egress: list(env.EGRESS_CONNECTORS),
  };
}
