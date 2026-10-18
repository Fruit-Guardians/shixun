import DailyReader from '@/app/components/DailyReader';
import { listReports } from '@/lib/reports';
export const dynamic='force-dynamic';
export default async function Home(){try{return <DailyReader initialReports={await listReports()} initialError={null}/>;}catch{return <DailyReader initialReports={[]} initialError="归档数据库暂未就绪，请稍后刷新。"/>;}}
