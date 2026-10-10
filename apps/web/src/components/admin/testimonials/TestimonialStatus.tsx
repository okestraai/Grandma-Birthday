import { Star } from 'lucide-react';
import type { AdminTestimonial } from '@birthday/types';
import { Badge } from '@/components/ui/badge';
import { ModerationBadge } from '../misc';

export function TestimonialStatus({ testimonial }: { testimonial: AdminTestimonial }) {
  return (
    <span className="inline-flex flex-nowrap items-center gap-1 whitespace-nowrap">
      <ModerationBadge status={testimonial.status} />
      {testimonial.isFeatured && (
        <Badge tone="gold">
          <Star className="size-3" aria-hidden fill="currentColor" /> Featured
        </Badge>
      )}
    </span>
  );
}
