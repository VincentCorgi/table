"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "../../cn"
import { Button } from "./button"
import { XIcon } from "lucide-react"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

/**
 * Bottom-anchored on a narrow screen, centred from `sm:` up.
 *
 * The switch follows the width available rather than the kind of device, so a
 * narrow window on a desktop behaves like a phone — and, being pure CSS, it
 * needs no measurement and cannot disagree between the server and the client.
 *
 * Why bottom at all: a dialog centred on a phone covers whatever the user was
 * looking at when they opened it. Where that thing is what they are deciding
 * about — a position just chosen on a floor plan — covering it is the whole
 * problem.
 */
const SHEET_CLASS = [
  "inset-x-0 top-auto bottom-0 left-0 max-h-[85dvh] w-full max-w-none translate-x-0 translate-y-0 rounded-t-2xl rounded-b-none",
  "data-open:slide-in-from-bottom data-closed:slide-out-to-bottom data-open:zoom-in-100 data-closed:zoom-out-100",
  // Back to a centred dialog once there is room for one.
  "sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[calc(100dvh-2rem)] sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl",
  "sm:data-open:slide-in-from-bottom-0 sm:data-closed:slide-out-to-bottom-0 sm:data-open:zoom-in-95 sm:data-closed:zoom-out-95",
].join(" ")

/**
 * The grab handle of a sheet, and the only part of it that dismisses by drag.
 *
 * Not the whole sheet: its content scrolls, and a downward drag that has to mean
 * "scroll up" in one place and "dismiss" in another cannot be told apart
 * reliably. Confining the gesture to the handle is a cruder rule that always
 * agrees with itself.
 */
/**
 * Exported because the same affordance is needed by a panel that is not a
 * dialog: a form anchored to the bottom of a full-screen view has the same
 * dismiss gesture to offer and no `Dialog` to get it from.
 */
function DialogSheetHandle({ onDismiss }: { onDismiss: () => void }) {
  const startRef = React.useRef<number | null>(null)
  return (
    <div
      data-slot="dialog-sheet-handle"
      aria-hidden
      className="-mt-1 flex touch-none justify-center py-2 sm:hidden"
      onPointerDown={(event) => {
        startRef.current = event.clientY
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const start = startRef.current
        if (start === null) return
        // Far enough that it cannot be the tail of a tap. Dismissing costs the
        // user nothing here — the form creates nothing until it is submitted —
        // so a generous threshold is the wrong way to be careful.
        if (event.clientY - start > 48) {
          startRef.current = null
          onDismiss()
        }
      }}
      onPointerUp={() => {
        startRef.current = null
      }}
      onPointerCancel={() => {
        startRef.current = null
      }}
    >
      <span className="bg-muted-foreground/30 h-1 w-10 rounded-full" />
    </div>
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  variant = "dialog",
  onDismiss,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
  /** `sheet` sits against the bottom edge on a narrow screen. */
  variant?: "dialog" | "sheet"
  /** Required by `sheet` — what the drag handle calls. */
  onDismiss?: () => void
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        data-variant={variant}
        className={cn(
          // max-h + overflow-y, or a tall dialog is clipped by the viewport with
          // no way to reach the rest of it: the popup is fixed and centred, so
          // what overflows sits off-screen rather than below the fold. Worst on
          // a phone, where the keyboard takes a third of the height and the
          // submit button is the part that disappears.
          //
          // dvh, not vh: mobile browsers measure vh against the viewport with
          // the address bar hidden, which is taller than what is actually shown.
          "fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          variant === "sheet" && SHEET_CLASS,
          className
        )}
        {...props}
      >
        {variant === "sheet" && onDismiss && (
          <DialogSheetHandle onDismiss={onDismiss} />
        )}
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogSheetHandle,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
