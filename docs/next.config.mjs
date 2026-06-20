import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: '/install',
        destination:
          'https://raw.githubusercontent.com/NateAGeek/commaagent2/main/packages/cli/install/install.sh',
        permanent: false,
      },
      {
        source: '/install.ps1',
        destination:
          'https://raw.githubusercontent.com/NateAGeek/commaagent2/main/packages/cli/install/install.ps1',
        permanent: false,
      },
    ];
  },
};

export default withMDX(config);
