import InactiveDetection from "@/app/components/InactiveDetection";
import { PageResetProvider } from "@/components/PageResetProvider";
import { TagTooltipProvider } from "@/components/TagTooltipProvider";
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
        <PageResetProvider>
          <TagTooltipProvider>{children}</TagTooltipProvider>
        </PageResetProvider>
        <InactiveDetection />
      </body>
    </html>
  );
}
