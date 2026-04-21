import { LayoutDashboard, User as UserIcon, LogOut, Users, Dumbbell, Apple, TrendingUp } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { user, signOut, role } = useAuth();

  const isActive = (path: string) => location.pathname === path;
  const linkCls = (active: boolean) =>
    `flex items-center gap-2 w-full ${
      active ? "bg-muted text-primary font-medium" : "hover:bg-muted/50"
    }`;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-border/60">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="w-8 h-8 rounded-lg gradient-brand flex items-center justify-center flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
            </svg>
          </div>
          {!collapsed && <span className="font-semibold tracking-tight">Coach</span>}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/")}>
                  <NavLink to="/" className={linkCls(isActive("/"))}>
                    <LayoutDashboard className="h-4 w-4 shrink-0" />
                    {!collapsed && <span>Dashboard</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {role === "coach" && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/clients")}>
                    <NavLink to="/clients" className={linkCls(isActive("/clients"))}>
                      <Users className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>Clients</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {role === "coach" && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/workouts") || location.pathname.startsWith("/workouts/")}>
                    <NavLink to="/workouts" className={linkCls(isActive("/workouts") || location.pathname.startsWith("/workouts/"))}>
                      <Dumbbell className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>Workouts</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {role === "user" && (
                <>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/training")}>
                      <NavLink to="/training" className={linkCls(isActive("/training"))}>
                        <Dumbbell className="h-4 w-4 shrink-0" />
                        {!collapsed && <span>Training</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/nutrition")}>
                      <NavLink to="/nutrition" className={linkCls(isActive("/nutrition"))}>
                        <Apple className="h-4 w-4 shrink-0" />
                        {!collapsed && <span>Nutrition</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/progression")}>
                      <NavLink to="/progression" className={linkCls(isActive("/progression"))}>
                        <TrendingUp className="h-4 w-4 shrink-0" />
                        {!collapsed && <span>Progression</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border/60">
        <SidebarGroup>
          <SidebarGroupLabel>Account</SidebarGroupLabel>
          <SidebarGroupContent>
            {!collapsed && (
              <div className="px-2 py-1.5 space-y-0.5">
                <p className="text-sm font-medium truncate">
                  {user?.user_metadata?.display_name ?? "Coach"}
                </p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            )}
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/account" className={linkCls(isActive("/account"))}>
                    <UserIcon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span>Profile</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            {!collapsed && (
              <div className="px-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={signOut}
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </Button>
              </div>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  );
}
