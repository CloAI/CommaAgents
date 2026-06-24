import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();
const isStaticExport = process.env.COMMA_DOCS_STATIC_EXPORT === 'true';

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  ...(isStaticExport
    ? {
        output: 'export',
        trailingSlash: true,
        images: {
          unoptimized: true,
        },
      }
    : {}),
};

export default withMDX(config);
