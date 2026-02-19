/** @type {import('next').NextConfig} */
const nextConfig = {
    serverExternalPackages: ['cheerio', 'yt-search'],
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        ignoreBuildErrors: true,
    }
};

export default nextConfig;
