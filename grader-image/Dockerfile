FROM public.ecr.aws/lambda/microvms:al2023-minimal
# nodejs on this base image is v18 (dnf has no nodejs20); the runner is bundled for node18.
RUN dnf install -y python3 nodejs util-linux shadow-utils && dnf clean all
RUN useradd -u 1001 -M -s /sbin/nologin sandbox
# root-owned, not writable by the sandbox user
RUN mkdir /sandbox && chmod 755 /sandbox
COPY dist/ /app/
EXPOSE 8080
CMD ["node", "/app/server.js"]
