import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { questionsQuery } from '@/lib/admin-queries';
import { FilterTabs, PageHeader } from '@/components/admin/ui';
import { CategoriesSection } from '@/components/admin/guests/CategoriesSection';
import { QuestionsSection } from '@/components/admin/guests/QuestionsSection';
import { useGuestCategories } from '@/components/admin/guests/shared';

type Tab = 'categories' | 'questions';

export default function GuestCategoriesPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'questions' ? 'questions' : 'categories';
  const categories = useGuestCategories();
  // Shares its cache with QuestionsSection; here only for the tab count.
  const questions = useQuery(questionsQuery);

  return (
    <>
      <PageHeader
        title={tab === 'categories' ? 'Guest categories' : 'RSVP questions'}
        seoTitle="Categories and RSVP questions"
        description={
          tab === 'categories'
            ? 'Group guests and set how many companions each group may bring by default.'
            : 'Extra questions guests answer when they RSVP.'
        }
      />
      <FilterTabs<Tab>
        label="Section"
        className="mb-4"
        value={tab}
        onChange={(value) => setParams(value === 'categories' ? {} : { tab: value }, { replace: true })}
        tabs={[
          { value: 'categories', label: 'Categories', count: categories.data?.length },
          { value: 'questions', label: 'RSVP questions', count: questions.data?.length },
        ]}
      />
      {tab === 'categories' ? <CategoriesSection /> : <QuestionsSection />}
    </>
  );
}
