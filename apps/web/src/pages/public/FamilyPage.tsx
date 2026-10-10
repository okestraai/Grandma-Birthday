import { Users } from 'lucide-react';
import { SEO } from '@/components/seo/SEO';
import { PageHero, SectionHeading } from '@/components/public/section';
import { Reveal } from '@/components/public/reveal';
import { FamilyTree } from '@/components/public/family/FamilyTree';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/skeleton';
import { siteNameOf, useFamily, useSite } from '@/lib/public-api';

const SKELETON_ROWS = [2, 3, 4, 5];

function FamilyTreeSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-12 lg:space-y-16">
      <span className="sr-only">Loading the family tree…</span>
      {SKELETON_ROWS.map((count, row) => (
        <div key={row} className="lg:grid lg:grid-cols-[8.5rem_1fr] lg:gap-6">
          <div className="mb-5 flex items-center gap-3 lg:mb-0 lg:block lg:pt-8">
            <Skeleton className="size-9 rounded-full lg:h-6 lg:w-8 lg:rounded-md" />
            <Skeleton className="h-4 w-40 lg:mt-3 lg:h-3 lg:w-24" />
          </div>
          {/* phones: stacked cards */}
          <div className="space-y-3 pl-12 lg:hidden">
            {Array.from({ length: Math.min(count, 2) }, (_, i) => (
              <div key={i} className="flex items-center gap-4 rounded-2xl border border-gold/15 p-4">
                <Skeleton className="size-14 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
              </div>
            ))}
          </div>
          {/* desktop: a row of portraits */}
          <div className="hidden flex-wrap justify-center gap-x-10 gap-y-10 lg:flex">
            {Array.from({ length: count }, (_, i) => (
              <div key={i} className="flex w-32 flex-col items-center gap-3">
                <Skeleton className="size-20 rounded-full" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FamilyPage() {
  const { data: site } = useSite();
  const family = useFamily();
  const members = family.data?.members ?? [];

  let content;
  if (family.isPending) {
    content = <FamilyTreeSkeleton />;
  } else if (family.isError && !family.data) {
    content = <ErrorState error={family.error} onRetry={() => void family.refetch()} title="We could not load the family tree" />;
  } else if (members.length === 0) {
    content = (
      <EmptyState
        icon={<Users className="size-7" />}
        title="The family tree is still being gathered"
        description="Portraits and stories are on their way. Please visit again soon."
      />
    );
  } else {
    content = <FamilyTree tree={family.data} celebrantName={site?.celebrant.preferredName} />;
  }

  return (
    <>
      <SEO
        title="Family"
        description="Meet the family: the parents, brothers and sisters, children and grandchildren whose love fills this celebration."
        siteName={siteNameOf(site)}
      />
      <PageHero
        eyebrow="Family"
        title="The family that love built"
        description="Every life is held up by others. Here are the generations who came before, who grew up alongside, and who carry the story forward."
      />
      <section aria-labelledby="family-tree-heading" className="bg-ivory py-16 sm:py-24">
        <div className="container-page">
          <Reveal>
            <SectionHeading
              id="family-tree-heading"
              eyebrow="The family tree"
              title="Generations, together"
              description="Select anyone in the tree to see their portrait, their story and how they are connected."
            />
          </Reveal>
          <div className="mt-12 sm:mt-16">{content}</div>
        </div>
      </section>
    </>
  );
}
