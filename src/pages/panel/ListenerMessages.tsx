import React, { useEffect, useState } from 'react';
import withSuspense from '@src/shared/hoc/withSuspense';
import withErrorBoundary from '@src/shared/hoc/withErrorBoundary';
import { Nav } from '@src/components/ui/nav';
// import { Tabs, TabsContent, TabsList, TabsTrigger } from '@src/components/ui/tabs';
import { Inbox, Code, Braces } from 'lucide-react';
import { usePostMessage } from '@root/src/shared/hooks/usePostMessage';
import { ExtensionCommandType, ExtensionListenerMessage } from '@root/src/shared/types/message';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from './data-table';
import { Badge } from '@root/src/components/ui/badge';

export const columns: ColumnDef<ExtensionListenerMessage>[] = [
  {
    accessorKey: 'origin',
    header: 'Url',
    cell: ({ row }) => {
      return (
        <Badge variant="outline">
          <span className="max-w-[300px] line-clamp-1 text-sky-600">{row.getValue('origin')}</span>
        </Badge>
      );
    },
  },
  {
    accessorKey: 'frame',
    header: 'Frame',
    cell: ({ row }) => {
      return (
        <Badge variant="outline">
          <span className="max-w-[300px] line-clamp-1 text-red-600">{row.getValue('frame')}</span>
        </Badge>
      );
    },
  },
  {
    accessorKey: 'stack',
    header: 'Stack',
    cell: ({ row }) => {
      return <span className="max-w-[500px] line-clamp-5 text-amber-600">{row.getValue('stack')}</span>;
    },
  },
  {
    accessorKey: 'listener',
    header: 'Listener',
    cell: ({ row }) => {
      return <span className="max-w-[500px] line-clamp-5 text-green-600">{row.getValue('listener')}</span>;
    },
  },
];

const ListenerMessages = () => {
  const { send, receiveListenerMessage, receiveCommand, receivePostMessage } = usePostMessage({ name: 'devtools' });
  const [listeners, setListeners] = useState<ExtensionListenerMessage[]>([]);
  const [messagesCount, setMessagesCount] = useState<number>(0);
  useEffect(() => {
    receivePostMessage(message => {
      if (!message) return;
      send({
        name: 'fetch',
        tabId: chrome.devtools.inspectedWindow.tabId,
      });
    });
    receiveCommand(message => {
      if (!message) return;
      if (message.command === ExtensionCommandType.initial && message.listeners && message.messages) {
        setListeners(message.listeners);
        setMessagesCount(message.messages.length);
      } else if (message.command === ExtensionCommandType.reload) {
        setListeners([]);
        setMessagesCount(0);
      }
    });
    receiveListenerMessage(message => {
      if (!message) return;
      send({
        name: 'fetch',
        tabId: chrome.devtools.inspectedWindow.tabId,
      });
    });
    send({
      name: 'init',
      tabId: chrome.devtools.inspectedWindow.tabId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="flex bg-background w-full h-full">
      <div>
        <Nav
          isCollapsed={false}
          links={[
            {
              title: 'Messages',
              label: messagesCount > 0 ? messagesCount.toString() : '',
              icon: Inbox,
              to: '/index.html',
              variant: 'ghost',
            },
            {
              title: 'Listeners',
              label: listeners.length > 0 ? listeners.length.toString() : '',
              icon: Braces,
              to: '/listeners',
              variant: 'default',
            },
          ]}></Nav>
      </div>
      <div className="grow w-full p-2 overflow-auto">
        <DataTable columns={columns} data={listeners} />
      </div>
    </div>
  );
};

export default withErrorBoundary(withSuspense(ListenerMessages, <div> Loading ... </div>), <div> Error Occur </div>);
