import InactiveDetection from "@/app/components/InactiveDetection";
import { getTagTypeColorsCss } from "@/lib/userSettings";

import '@/scss/main.scss';

export const metadata = {
  title: "short_lib",
  description: "",
};

export default function RootLayout({ children }) {
  const tagTypeColorCss = getTagTypeColorsCss();

  return (
    <html lang="en">
      <body>
        {tagTypeColorCss ? <style id="tag-type-colors">{tagTypeColorCss}</style> : null}
        {children}
        <InactiveDetection />
      </body>
    </html>
  );
}
