import { AppSidebar } from "@/components/Sidebar";
import { Navbar } from "@/components/Navbar";
import { SidebarProvider, SidebarInset } from "@/components/animate-ui/components/radix/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <div className="sticky top-0 z-10 bg-background">
          <Navbar />
        </div>
        <div className="flex-1 overflow-auto overflow-x-hidden p-4 lg:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
