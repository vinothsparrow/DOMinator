import React, { useEffect, useState } from 'react';
import withSuspense from '@src/shared/hoc/withSuspense';
import withErrorBoundary from '@src/shared/hoc/withErrorBoundary';
import { Nav } from '@src/components/ui/nav';
// import { Tabs, TabsContent, TabsList, TabsTrigger } from '@src/components/ui/tabs';
import { Inbox, Code, Braces } from 'lucide-react';
import { usePostMessage } from '@root/src/shared/hooks/usePostMessage';
import { ExtensionCommandType, ExtensionPostMessage } from '@root/src/shared/types/message';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from './data-table';
import { Badge } from '@root/src/components/ui/badge';

export const columns: ColumnDef<ExtensionPostMessage>[] = [
  {
    accessorKey: 'from',
    header: 'Source => Target',
    cell: ({ row }) => {
      return (
        <div className="flex space-x-2">
          <Badge variant="outline">
            <span className="max-w-[200px] line-clamp-1 text-sky-600">{row.getValue('from')}</span>
          </Badge>
          <span className="text-sky-600">{'=>'}</span>
          <Badge variant="outline">
            <span className="max-w-[200px] line-clamp-1 text-sky-600">{row.original.to}</span>
          </Badge>
        </div>
      );
    },
  },
  {
    accessorKey: 'message',
    header: 'Message',
    cell: ({ row }) => {
      return <span className="max-w-[700px] line-clamp-5 text-green-600">{row.getValue('message')}</span>;
    },
  },
  {
    accessorKey: 'fromFrame',
    header: 'Frame',
    cell: ({ row }) => {
      return (
        <div className="flex space-x-2">
          <Badge variant="outline" className="text-red-600">
            {row.getValue('fromFrame')}
          </Badge>
          <span className="text-red-600">{'=>'}</span>
          <Badge variant="outline" className="text-red-600">
            {row.original.toFrame}
          </Badge>
        </div>
      );
    },
  },
];

const PostMessages = () => {
  const { send, receivePostMessage, receiveListenerMessage, receiveCommand } = usePostMessage({ name: 'devtools' });
  const [messages, setMessages] = useState<ExtensionPostMessage[]>([]);
  const [listenerCount, setListenerCount] = useState<number>(0);
  console.log(messages);
  useEffect(() => {
    receivePostMessage(message => {
      if (!message) return;
      send({
        name: 'fetch',
        tabId: chrome.devtools.inspectedWindow.tabId,
      });
    });
    receiveListenerMessage(message => {
      if (!message) return;
      send({
        name: 'fetch',
        tabId: chrome.devtools.inspectedWindow.tabId,
      });
    });
    receiveCommand(message => {
      if (!message) return;
      if (message.command === ExtensionCommandType.initial && message.listeners && message.messages) {
        setMessages(message.messages);
        setListenerCount(message.listeners.length);
      } else if (message.command === ExtensionCommandType.reload) {
        setMessages([]);
        setListenerCount(0);
      }
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
              label: messages.length > 0 ? messages.length.toString() : '',
              icon: Inbox,
              to: '/index.html',
              variant: 'default',
            },
            {
              title: 'Listeners',
              label: listenerCount > 0 ? listenerCount.toString() : '',
              icon: Braces,
              to: '/listeners',
              variant: 'ghost',
            },
            // {
            //   title: 'DOM Sink',
            //   label: '0',
            //   icon: Code,
            //   to: '/sinks',
            //   variant: 'ghost',
            // },
          ]}></Nav>
      </div>
      <div className="grow w-full p-2 overflow-x-auto">
        <DataTable columns={columns} data={messages} />
      </div>
    </div>
  );
};

export default withErrorBoundary(withSuspense(PostMessages, <div> Loading ... </div>), <div> Error Occur </div>);
