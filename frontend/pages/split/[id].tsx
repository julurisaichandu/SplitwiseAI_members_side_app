
import { useRouter } from 'next/router';
import SplitDetail from '../../components/SplitDetail';

export default function SplitPage() {
  const router = useRouter();
  const { id } = router.query;

  if (!id || typeof id !== 'string') {
    return <div>Loading...</div>;
  }

  return <SplitDetail splitId={id} />;
}
