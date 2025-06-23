import * as React from "react"

import { useMediaQuery } from "@/hooks/useMediaQuery"
import { Button } from "@browse-dot-show/ui"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@browse-dot-show/ui"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@browse-dot-show/ui"

interface ResponsiveDrawerOrDialogProps {
  childTrigger: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
  descriptionHidden?: boolean
}

export default function ResponsiveDrawerOrDialog({ childTrigger, title, description, children, descriptionHidden }: ResponsiveDrawerOrDialogProps) {
  const [open, setOpen] = React.useState(false)

  // https://ui.shadcn.com/docs/components/drawer#responsive-dialog
  const isDesktop = useMediaQuery("(min-width: 768px)")

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          {childTrigger}
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px] font-mono bg-background text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl">{title}</DialogTitle>
            <DialogDescription className={descriptionHidden ? "sr-only" : ""}>
              {description}
            </DialogDescription>
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        {childTrigger}
      </DrawerTrigger>
      <DrawerContent className="font-mono bg-background text-foreground">
        <DrawerHeader className="text-left">
          <DrawerTitle className="text-xl">{title}</DrawerTitle>
          <DrawerDescription className={descriptionHidden ? "sr-only" : ""}>
            {description}
          </DrawerDescription>
        </DrawerHeader>
        <div className="p-4">
          {children}
        </div>
        <DrawerFooter className="pt-2">
          <DrawerClose asChild>
            <Button variant="outline" size="default">Done</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
