<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Shipping

Every push to `main` is a production deploy: Vercel builds mcpindex.ai from it. Do not push `main`
or run `vercel --prod` from a working session. Finish the change on a branch and submit it to the
release queue, which merges it onto `main`, runs lint, tests, the guide gates and the build, and
deploys only after the owner approves.
