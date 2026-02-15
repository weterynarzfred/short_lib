/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  images: {
    localPatterns: [
      { pathname: '/api/media/**' },
    ],
  },
};

export default nextConfig;
