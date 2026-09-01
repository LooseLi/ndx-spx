/** @type {import('next').NextConfig} */
const nextConfig = {
  // 纯静态导出，数据在构建时从 data/*.json 读入。
  // GitHub Actions 抓完数据 commit 后，Vercel 监听 push 自动重新构建。
  output: 'export',
  images: { unoptimized: true },
  // GitHub Pages 部署在子路径时需要设置，Vercel 部署留空
  basePath: process.env.BASE_PATH || '',
  trailingSlash: true,
}

export default nextConfig
