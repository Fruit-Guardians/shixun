import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';

/** 两个对话框共用的外壳：焦点管理、Esc 关闭与关闭按钮由 Dialog 提供。 */
interface ModalFrameProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 窗口标题栏里的文字。 */
  title: string;
  children: ReactNode;
}

export default function ModalFrame({ open, onOpenChange, title, children }: ModalFrameProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="modal" showCloseButton={false} aria-describedby={undefined}>
        <div className="window-bar">
          <span className="window-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="window-title">{title}</span>
          <DialogClose className="modal-close" aria-label="关闭窗口">
            <X size={16} />
          </DialogClose>
        </div>
        <div className="modal-body">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
