# Workspace Rules: Originate Command

Always strictly follow and uphold all core rules and specifications defined in `dev3/Rules.md`:

1. **Unified Operations Board**:
   - Maintain the unified interface combining daily tasks (Todos) on the left panel and company policies/announcements (Instructions) on the right panel into a single interface.

2. **Hierarchy & Role Permissions**:
   - Enforce access, task assignment, and visibility based on department hierarchy across the 6 departments (`Admin & HR`, `Business Operations`, `Lead Generation`, `Outreach Operations`, `Social Media Management`, `Development Operations`).
   - Authority is computed from each department's ordered hierarchy levels (`head`, `member`, `intern`). Authority never crosses into another department unless permitted via group membership or system admin privileges.

3. **Client & Cross-Department Group Management**:
   - Track tasks and instructions per client, and facilitate cross-functional teamwork across departments.

4. **Automated Recurrence & Escalation**:
   - Automatically regenerate recurring tasks upon completion (`daily`, `weekly`, `monthly`, `quarterly`).
   - Escalate overdue work up the management chain (Day 1 overdue -> Department Head; Day 2+ overdue -> Leadership / System Admin).

5. **Real-Time Synchronization & Audit Trail**:
   - Keep all team members in sync with real-time updates and synchronization.
   - Maintain an immutable activity audit log for state mutations and operations.
