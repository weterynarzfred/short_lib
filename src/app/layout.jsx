import '@/scss/main.scss';

export const metadata = {
  title: "short_lib",
  description: "",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
