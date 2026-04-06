/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['ffmpeg-static'],
  experimental: {
    serverComponentsExternalPackages: ['ffmpeg-static'],
  },
};

export default nextConfig;
