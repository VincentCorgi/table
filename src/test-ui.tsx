/**
 * 契約的參考實作，供這個套件自己的測試使用。
 *
 * 套件在執行時期不認識任何 primitive 函式庫——那是它能同時活在兩個 app 裡的
 * 原因。但它自己的測試得有東西可以渲染，而那份實作必須夠真：浮層要真的會開
 * 關、Esc 要真的帶得出 reason、對話框要真的困住焦點。用純 HTML 樁件測不到那
 * 些，測試會通過而真實使用會壞。
 *
 * 所以這裡用 base-ui（devDependency，不進執行時期），元件抄自 homepass 的
 * shadcn。**它同時是給採用者的參考實作**：要接這個套件，照 `src/test/ui/`
 * 寫一份自己的即可。
 */

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { configureTableUI, type TableUIComponents } from "./table-ui";
import { Badge } from "./test/ui/badge";
import { Button } from "./test/ui/button";
import { Checkbox } from "./test/ui/checkbox";
import { Input } from "./test/ui/input";
import { Label } from "./test/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./test/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./test/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./test/ui/table";

/**
 * 錨在儲存格上的浮層。`ui/popover.tsx` 沒有轉發 `anchor`，所以這裡直接用
 * primitive——採用者那一側也會遇到同一件事。
 */
const AnchoredPopup: TableUIComponents["AnchoredPopup"] = ({
  anchor,
  open,
  onOpenChange,
  className,
  children,
  ...rest
}) => (
  <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        anchor={anchor}
        align="start"
        side="bottom"
        sideOffset={4}
        className="isolate z-50"
      >
        <PopoverPrimitive.Popup className={className} {...rest}>
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  </PopoverPrimitive.Root>
);

configureTableUI({
  Badge,
  Button,
  Checkbox,
  Input,
  Label,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  AnchoredPopup,
} as TableUIComponents);
