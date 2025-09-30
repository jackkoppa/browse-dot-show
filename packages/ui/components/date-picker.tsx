"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon, Cross2Icon } from "@radix-ui/react-icons"
import { DateRange, SelectRangeEventHandler } from "react-day-picker"

import { cn } from "../lib/utils"
import { Button } from "./button"
import { Calendar } from "./calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./popover"

interface DatePickerProps {
  /**
   * The selected date range
   */
  date?: DateRange
  /**
   * Event handler when the date range changes
   */
  onDateChange?: SelectRangeEventHandler
  /**
   * Minimum selectable date
   */
  fromDate?: Date
  /**
   * Maximum selectable date  
   */
  toDate?: Date
  /**
   * Placeholder text when no date is selected
   */
  placeholder?: string
  /**
   * Additional CSS classes
   */
  className?: string
  /**
   * Whether the date picker is disabled
   */
  disabled?: boolean
}

export function DatePicker({
  date,
  onDateChange,
  fromDate,
  toDate,
  placeholder = "Pick a date range",
  className,
  disabled = false,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)

  const handleDateSelect: SelectRangeEventHandler = (range) => {
    onDateChange?.(range)
    // Close popover if both dates are selected
    if (range?.from && range?.to) {
      setOpen(false)
    }
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDateChange?.(undefined)
  }

  const formatDateRange = (range?: DateRange) => {
    if (!range?.from) return placeholder
    if (!range.to) return format(range.from, "MMM dd, yyyy")
    return `${format(range.from, "MMM dd, yyyy")} - ${format(range.to, "MMM dd, yyyy")}`
  }

  const hasSelection = date?.from || date?.to

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant="outline"
            className={cn(
              "justify-start text-left font-normal",
              !hasSelection && "text-muted-foreground",
              "border-foreground border-2 shadow-[2px_2px_0px_rgba(0,0,0,1)] rounded-none"
            )}
            disabled={disabled}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {formatDateRange(date)}
            {hasSelection && !disabled && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-4 w-4 p-0 hover:bg-transparent"
                onClick={handleClear}
              >
                <Cross2Icon className="h-3 w-3" />
                <span className="sr-only">Clear date range</span>
              </Button>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-auto p-0 border-foreground border-2 shadow-[4px_4px_0px_rgba(0,0,0,1)] rounded-none" 
          align="start"
        >
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={handleDateSelect}
            numberOfMonths={2}
            fromDate={fromDate}
            toDate={toDate}
            disabled={disabled ? () => true : undefined}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

DatePicker.displayName = "DatePicker"
