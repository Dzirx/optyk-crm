import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getUserBusiness } from '@/lib/api/get-user-business';
import { missingPrintDetails } from '@/lib/business-details';
import { PrintToolbar } from './print-toolbar';
import { WorkOrderPrintSheet } from './work-order-print-sheet';
import { PRINT_FORMATS, printFormat } from './formats';
import styles from './print.module.css';

export default async function WorkOrderPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ format?: string }>;
}) {
  const { id } = await params;
  const format = printFormat((await searchParams).format);
  const { width, height } = PRINT_FORMATS[format];

  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const business = await getUserBusiness(session.user.id);
  if (!business) {
    redirect('/login');
  }

  const workOrder = await db.workOrder.findFirst({
    where: { id, businessId: business.id },
    include: {
      customer: true,
      items: { orderBy: { id: 'asc' } },
    },
  });

  if (!workOrder) {
    notFound();
  }

  return (
    <div
      className={styles.screenWrapper}
      style={{ '--page-w': `${width}mm`, '--page-h': `${height}mm` } as React.CSSProperties}
    >
      {/* Rozmiar kartki zależy od formatu, więc @page nie może być w module CSS. */}
      <style>{`@page { size: ${width}mm ${height}mm; margin: 0; }`}</style>
      <PrintToolbar missingDetails={missingPrintDetails(business)} format={format} />
      <WorkOrderPrintSheet workOrder={workOrder} business={business} />
    </div>
  );
}
