const isElectron = process.env.BUILD_TARGET === 'electron';

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(isElectron && {
    output: 'export',
    // Use root-based asset URLs so they resolve under the custom app:// protocol (avoid relative ./_next paths breaking on nested routes)
    trailingSlash: true,
  }),
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
