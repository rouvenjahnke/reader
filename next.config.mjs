import withPWAInit from 'next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development'
});

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  images: {
    unoptimized: true
  },
  outputFileTracingExcludes: {
    '/*': [
      './node_modules/@img/**/*',
      './node_modules/sharp/**/*',
      './node_modules/typescript/**/*',
      './node_modules/@esbuild/**/*',
      './node_modules/esbuild/**/*',
      './node_modules/webpack/**/*'
    ]
  }
};

export default withPWA(nextConfig);
