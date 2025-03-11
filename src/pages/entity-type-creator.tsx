import CheckFlattening from '@/src/components/CheckFlattening';
import DBInspector from '@/src/components/DBInspector';
import EntityTypeManager from '@/src/components/EntityTypeManager';
import FqmConnector from '@/src/components/FqmConnector';
import MigrationHelper from '@/src/components/MigrationHelper';
import ModuleInstaller from '@/src/components/ModuleInstaller';
import PostgresConnector from '@/src/components/PostgresConnector';
import QueryTool from '@/src/components/QueryTool';
import QueryValues from '@/src/components/QueryValues';
import { EntityType, Schema } from '@/types';
import { Box, Container, Drawer, Tab, Tabs } from '@mui/material';
import { useEffect, useState } from 'react';
import io, { Socket } from 'socket.io-client';

export default function EntryPoint() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [schema, setSchema] = useState<Schema>({ columns: {}, routines: {}, typeMapping: {}, isView: {} });

  useEffect(() => {
    (async () => {
      if (!socket) {
        console.log('Creating socket');

        await fetch('/api/socket');
        const newSocket = io();

        newSocket.on('connect', () => {
          console.log('connected');
        });

        newSocket.on('database-schema', (schema) => {
          console.log('Received schema', schema);
          setSchema(schema);
        });

        newSocket.on('warning', (msg) => alert(msg));

        setSocket(newSocket);
      }
    })();
  }, [socket]);

  const [selectedTab, setSelectedTab] = useState(0);
  const [expandedBottom, setExpandedBottom] = useState(false);

  const [currentEntityType, setCurrentEntityType] = useState<EntityType | null>(null);

  return (
    socket && (
      <Container>
        <Box sx={{ m: 2 }}>
          <FqmConnector socket={socket} />
          <PostgresConnector socket={socket} />
        </Box>

        <Box sx={{ mb: 8 }}>
          <EntityTypeManager
            socket={socket}
            schema={{ ...schema.columns, ...schema.routines }}
            setCurrentEntityType={setCurrentEntityType}
          />
        </Box>

        <Drawer
          sx={{
            height: selectedTab ? (expandedBottom ? '100vh' : '30vh') : undefined,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              height: selectedTab ? (expandedBottom ? '100vh' : '30vh') : undefined,
              boxSizing: 'border-box',
            },
          }}
          variant="permanent"
          anchor="bottom"
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', maxHeight: 'inherit' }}>
            <Tabs
              value={selectedTab}
              onChange={(_e, n) => {
                if (n === 7) {
                  setExpandedBottom((e) => !e);
                } else {
                  setSelectedTab(n);
                }
              }}
              sx={{ borderTop: '1px solid #aaa' }}
            >
              <Tab label="Hide" disabled={selectedTab === 0} />
              <Tab label="Module Installer" />
              <Tab label="Check Flattening" />
              <Tab label="Query Tool" />
              <Tab label="Column Values" />
              <Tab label="DB Inspector" />
              <Tab label="Migration Helper" />
              <Tab label={expandedBottom ? 'Collapse' : 'Expand'} />
            </Tabs>

            <Box sx={{ overflowY: 'scroll' }}>
              <Box sx={{ display: selectedTab === 1 ? 'block' : 'none', p: 2 }}>
                <ModuleInstaller socket={socket} />
              </Box>
              <Box sx={{ display: selectedTab === 2 ? 'block' : 'none', p: 2 }}>
                <CheckFlattening socket={socket} entityType={currentEntityType} />
              </Box>
              <Box sx={{ display: selectedTab === 3 ? 'block' : 'none', p: 2 }}>
                <QueryTool socket={socket} entityType={currentEntityType} />
              </Box>
              <Box sx={{ display: selectedTab === 4 ? 'block' : 'none', p: 2 }}>
                <QueryValues socket={socket} entityType={currentEntityType} />
              </Box>
              <Box sx={{ display: selectedTab === 5 ? 'block' : 'none', p: 2 }}>
                <DBInspector socket={socket} schema={schema} entityType={currentEntityType} />
              </Box>
              <Box sx={{ display: selectedTab === 6 ? 'block' : 'none', p: 2 }}>
                <MigrationHelper />
              </Box>
            </Box>
          </Box>
        </Drawer>
      </Container>
    )
  );
}
