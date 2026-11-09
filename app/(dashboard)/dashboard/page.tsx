import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { todayRange } from '@/lib/time';
import { DashboardContent } from '@/components/dashboard/dashboard-content';

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    return null;
  }

  const userBusiness = await db.business.findFirst({
    where: { userId: session.user.id },
  });

  // „Dziś” w strefie salonu — serwer działa w UTC.
  const { start: today, end: tomorrow } = todayRange();

  let stats = {
    totalCustomers: 0,
    visitsToday: 0,
    readyOrders: 0,
  };

  let recentVisits: {
    id: string;
    customerName: string;
    visitDate: string;
    visitType: string | null;
    reminderSmsStatus: string | null;
    reviewSmsStatus: string | null;
    reminderSmsDate: string | null;
    reviewSmsDate: string | null;
  }[] = [];

  let readyWorkOrders: {
    id: string;
    orderNumber: string;
    customerName: string;
    pickupDate: string | null;
    totalAmount: string | null;
  }[] = [];

  if (userBusiness) {
    const [totalCustomers, visitsToday, readyOrdersCount] =
      await Promise.all([
        db.customer.count({ where: { businessId: userBusiness.id } }),
        db.visit.count({
          where: {
            customer: { businessId: userBusiness.id },
            visitDate: { gte: today, lt: tomorrow },
          },
        }),
        db.workOrder.count({
          where: { businessId: userBusiness.id, status: 'ready' },
        }),
      ]);

    stats.totalCustomers = totalCustomers;
    stats.visitsToday = visitsToday;
    stats.readyOrders = readyOrdersCount;

    const [recentVisitsRaw, readyOrdersRaw] = await Promise.all([
      db.visit.findMany({
        where: { customer: { businessId: userBusiness.id } },
        include: { customer: true },
        orderBy: { visitDate: 'desc' },
        take: 6,
      }),
      db.workOrder.findMany({
        where: { businessId: userBusiness.id, status: 'ready' },
        include: { customer: true },
        orderBy: { pickupDate: 'asc' },
        take: 6,
      }),
    ]);

    recentVisits = recentVisitsRaw.map((v) => ({
      id: v.id,
      customerName: `${v.customer.name} ${v.customer.surname}`,
      visitDate: v.visitDate.toISOString(),
      visitType: v.visitType,
      reminderSmsStatus: v.reminderSmsStatus,
      reviewSmsStatus: v.reviewSmsStatus,
      reminderSmsDate: v.reminderSmsDate?.toISOString() ?? null,
      reviewSmsDate: v.reviewSmsDate?.toISOString() ?? null,
    }));

    readyWorkOrders = readyOrdersRaw.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: `${o.customer.name} ${o.customer.surname}`,
      pickupDate: o.pickupDate?.toISOString() ?? null,
      totalAmount: o.totalAmount?.toString() ?? null,
    }));
  }

  return (
    <DashboardContent
      userName={session.user.name || session.user.email || 'User'}
      stats={stats}
      recentVisits={recentVisits}
      readyWorkOrders={readyWorkOrders}
    />
  );
}
