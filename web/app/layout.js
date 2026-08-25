import "./globals.css";

export const metadata = {
  title: "演唱会雷达 - 未来三个月演出",
  description: "实时展示所选城市未来三个月的演唱会、音乐节、Livehouse、话剧等演出信息",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
