import type { RefObject } from 'react';
import { Link, NavLink } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NavItem } from './nav';
import { EASE } from './reveal';

/**
 * The phone and tablet menu: a panel that slides in from the right. Loaded on first use by the
 * header, so the dialog code is not part of the first page load. Focus goes back to the menu
 * button when it closes.
 */
export default function MobileMenu({
  open,
  onOpenChange,
  returnFocusTo,
  links,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: RefObject<HTMLButtonElement | null>;
  links: readonly NavItem[];
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-navy/70"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              forceMount
              aria-describedby={undefined}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                returnFocusTo.current?.focus();
              }}
            >
              <motion.div
                className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-navy text-ivory shadow-lift focus:outline-none"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ duration: 0.55, ease: EASE }}
              >
                <div aria-hidden className="pointer-events-none absolute inset-0 bg-luxury opacity-60" />
                <div className="relative flex h-[72px] items-center justify-between px-5">
                  <Dialog.Title className="text-[11px] font-medium uppercase tracking-[0.3em] text-gold">Menu</Dialog.Title>
                  <Dialog.Close className="flex size-11 items-center justify-center rounded-full hover:bg-white/10" aria-label="Close menu">
                    <X className="size-6" aria-hidden />
                  </Dialog.Close>
                </div>
                <nav aria-label="Mobile" className="relative flex-1 overflow-y-auto px-5 pb-8">
                  <ul className="border-t border-gold/20">
                    {links.map((link, i) => (
                      <motion.li
                        key={link.to}
                        className="border-b border-gold/15"
                        initial={{ opacity: 0, x: 40, rotateY: -25 }}
                        animate={{ opacity: 1, x: 0, rotateY: 0 }}
                        whileHover={{ x: 8, transition: { duration: 0.25 } }}
                        whileTap={{ scale: 0.98, transition: { duration: 0.1 } }}
                        transition={{ duration: 0.55, ease: EASE, delay: 0.14 + i * 0.05 }}
                        style={{ transformPerspective: 600 }}
                      >
                        <NavLink
                          to={link.to}
                          end={link.to === '/'}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center justify-between py-4 font-display text-2xl transition-colors',
                              isActive ? 'text-gold' : 'text-ivory hover:text-champagne',
                            )
                          }
                        >
                          {({ isActive }) => (
                            <>
                              {link.label}
                              {isActive && (
                                <motion.span
                                  aria-hidden
                                  className="size-2 rotate-45 bg-gold"
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  transition={{ type: 'spring', stiffness: 400, damping: 14, delay: 0.4 }}
                                />
                              )}
                            </>
                          )}
                        </NavLink>
                      </motion.li>
                    ))}
                  </ul>
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: EASE, delay: 0.2 + links.length * 0.05 }}
                  >
                    <Link
                      to="/rsvp"
                      className="mt-8 flex h-12 items-center justify-center rounded-full bg-gold text-sm font-semibold tracking-wide text-navy"
                    >
                      RSVP
                    </Link>
                  </motion.div>
                </nav>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
