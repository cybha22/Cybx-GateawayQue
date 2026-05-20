"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Cpu,
  FileText,
  Key,
  Shield,
  BookOpen,
  ChevronRight,
  Rocket,
  Terminal,
  Globe,
  Zap,
  MessageCircle,
  List,
  Search,
  Link2,
  Cloud,
} from "lucide-react";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { motion, AnimatePresence } from "motion/react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarRail,
} from "@/components/animate-ui/components/radix/sidebar";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/" },
  { label: "Accounts", icon: Users, href: "/accounts" },
  { label: "Providers", icon: Zap, href: "/providers" },
  { label: "Models", icon: Cpu, href: "/models" },
  { label: "Logs", icon: FileText, href: "/logs" },
  { label: "Filters", icon: Shield, href: "/filters" },
  { label: "API Key", icon: Key, href: "/api-key" },
];

const securityItem = { label: "Security", icon: Shield, href: "/security" };

const proxySections = [
  { id: "pool", label: "Proxy Pool", icon: List, href: "/proxy" },
  { id: "scraper", label: "Scraper", icon: Search, href: "/proxy/scraper" },
];

const docsSections = [
  { id: "getting-started", label: "Getting Started", icon: Rocket },
  { id: "cli-commands", label: "CLI Commands", icon: Terminal },
  { id: "account-format", label: "Account File Format", icon: FileText },
  { id: "api-reference", label: "API Reference", icon: Globe },
  { id: "model-aliases", label: "Model Aliases", icon: BookOpen },
  { id: "load-balancing", label: "Load Balancing", icon: Zap },
];

export function AppSidebar() {
  const pathname = usePathname();
  const isDocsPage = pathname === "/docs";
  const isProxyPage = pathname.startsWith("/proxy");
  const [docsOpen, setDocsOpen] = useState(isDocsPage);
  const [proxyOpen, setProxyOpen] = useState(isProxyPage);
  const [version, setVersion] = useState("...");

  useEffect(() => {
    if (isProxyPage) setProxyOpen(true);
  }, [isProxyPage]);

  useEffect(() => {
    apiFetch<{ version: string }>("/api/system")
      .then((data) => setVersion(`v${data.version}`))
      .catch(() => setVersion("v0.1.0"));
  }, []);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-3 group-data-[collapsible=icon]:px-1.5">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <img
                  src="/icon.png"
                  alt="CybxAI"
                  width={32}
                  height={32}
                  className="rounded-lg shrink-0"
                />
                <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-bold tracking-[0.2em] uppercase">
                    CYB<span className="text-primary">X</span>AI
                  </span>
                  <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium leading-none text-primary w-fit">
                    {version}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="px-3 group-data-[collapsible=icon]:px-1.5">
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                      <Link href={item.href}>
                        <item.icon className="size-4 shrink-0" />
                        <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isProxyPage}
                  tooltip="Proxy"
                  onClick={() => setProxyOpen((v) => !v)}
                >
                  <Shield className="size-4 shrink-0" />
                  <span className="group-data-[collapsible=icon]:hidden flex-1">Proxy</span>
                  <ChevronRight className={`size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[collapsible=icon]:hidden ${proxyOpen ? "rotate-90" : ""}`} />
                </SidebarMenuButton>
                <AnimatePresence initial={false}>
                  {proxyOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <SidebarMenuSub>
                        {proxySections.map((section) => {
                          const isSubActive = section.href === "/proxy"
                            ? pathname === "/proxy"
                            : pathname.startsWith(section.href);
                          return (
                            <SidebarMenuSubItem key={section.id}>
                              <SidebarMenuSubButton
                                asChild
                                size="sm"
                                isActive={isSubActive}
                              >
                                <Link href={section.href}>
                                  <section.icon className="size-3.5" />
                                  <span>{section.label}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    </motion.div>
                  )}
                </AnimatePresence>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith("/integration")}
                  tooltip="Integration"
                >
                  <Link href="/integration">
                    <Link2 className="size-4 shrink-0" />
                    <span className="group-data-[collapsible=icon]:hidden">Integration</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith("/tunnel")}
                  tooltip="Tunnel"
                >
                  <Link href="/tunnel">
                    <Cloud className="size-4 shrink-0" />
                    <span className="group-data-[collapsible=icon]:hidden">Tunnel</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith(securityItem.href)}
                  tooltip={securityItem.label}
                >
                  <Link href={securityItem.href}>
                    <securityItem.icon className="size-4 shrink-0" />
                    <span className="group-data-[collapsible=icon]:hidden">{securityItem.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Chat">
                  <Link href="/chat">
                    <MessageCircle className="size-4 shrink-0" />
                    <span className="group-data-[collapsible=icon]:hidden">Chat</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Docs with collapsible tree */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isDocsPage}
                  tooltip="Docs"
                  onClick={() => setDocsOpen((v) => !v)}
                >
                  <BookOpen className="size-4 shrink-0" />
                  <span className="group-data-[collapsible=icon]:hidden flex-1">Docs</span>
                  <ChevronRight className={`size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[collapsible=icon]:hidden ${docsOpen ? "rotate-90" : ""}`} />
                </SidebarMenuButton>
                <AnimatePresence initial={false}>
                  {docsOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <SidebarMenuSub>
                        {docsSections.map((section) => (
                          <SidebarMenuSubItem key={section.id}>
                            <SidebarMenuSubButton
                              asChild
                              size="sm"
                            >
                              <a
                                href={`/docs#${section.id}`}
                                onClick={(e) => {
                                  if (pathname === "/docs") {
                                    e.preventDefault();
                                    document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                                  }
                                }}
                              >
                                <section.icon className="size-3.5" />
                                <span>{section.label}</span>
                              </a>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </motion.div>
                  )}
                </AnimatePresence>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}
