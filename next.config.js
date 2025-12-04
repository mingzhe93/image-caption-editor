const isElectron = process.env.BUILD_TARGET === 'electron';

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(isElectron && {
    output: 'export',
    assetPrefix: './',
  }),
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
